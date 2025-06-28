import os
import json
from google.cloud import discoveryengine
from google.api_core import retry, client_options
from google.api_core.exceptions import NotFound, PermissionDenied, ResourceExhausted, AlreadyExists
from concurrent.futures import ThreadPoolExecutor, as_completed
from tqdm import tqdm

class DatastoreUploader:
    def __init__(self, project_id, collection, data_store_id):
        self.project_id = project_id
        self.collection = collection
        self.data_store_id = data_store_id
        self.client = discoveryengine.DataStoreServiceClient()
        self.doc_client = discoveryengine.DocumentServiceClient()
        self.parent = f"projects/{self.project_id}/locations/global/collections/{self.collection}/dataStores/{self.data_store_id}/branches/default_branch"

    @retry.Retry()
    def create_datastore(self):
        parent = f"projects/{self.project_id}/locations/global/collections/{self.collection}"
        
        data_store = discoveryengine.DataStore()
        data_store.display_name = self.data_store_id
        data_store.industry_vertical = "GENERIC"
        data_store.solution_types = ["SOLUTION_TYPE_SEARCH"]
        data_store.content_config = discoveryengine.DataStore.ContentConfig.CONTENT_REQUIRED

        try:
            operation = self.client.create_data_store(
                parent=parent,
                data_store_id=self.data_store_id,
                data_store=data_store
            )
            response = operation.result()
            print(f"Data Store created: {response.name}")
            return response
        except AlreadyExists:
            print(f"Data Store {self.data_store_id} already exists. Using existing Data Store.")
            return self.client.get_data_store(name=f"{parent}/dataStores/{self.data_store_id}")

    @retry.Retry(predicate=retry.if_exception_type(
        ResourceExhausted,
        PermissionDenied,
    ))
    def upload_document(self, file_path):
        with open(file_path, 'r', encoding='utf-8') as f:
            doc_data = json.load(f)

        document = discoveryengine.Document()
        document.id = doc_data['id']
        document.content = discoveryengine.Document.Content()
        document.content.raw_bytes = doc_data['content'].encode('utf-8')
        document.content.mime_type = "text/plain"
        document.struct_data = {
            "section_id": doc_data['section_id'],
            "section_name": doc_data['section_name'],
        }

        try:
            response = self.doc_client.create_document(
                parent=self.parent,
                document=document,
                document_id=document.id
            )
            verification_result = self.verify_document(document.id, doc_data)
            return f"Document created: {response.name}\nVerification: {verification_result}"
        except AlreadyExists:
            return f"Document {document.id} already exists. Skipping."
        except Exception as e:
            return f"Error creating document {document.id}: {str(e)}"

    @retry.Retry(predicate=retry.if_exception_type(
        ResourceExhausted,
        PermissionDenied,
    ))
    def verify_document(self, document_id, original_data):
        try:
            name = f"{self.parent}/documents/{document_id}"
            retrieved_document = self.doc_client.get_document(name=name)
            
            verification_results = []
            if retrieved_document.id == original_data['id']:
                verification_results.append("ID: Matched")
            else:
                verification_results.append("ID: Mismatch")
            
            if retrieved_document.struct_data.get('section_id') == original_data['section_id']:
                verification_results.append("Section ID: Matched")
            else:
                verification_results.append("Section ID: Mismatch")
            
            if retrieved_document.struct_data.get('section_name') == original_data['section_name']:
                verification_results.append("Section Name: Matched")
            else:
                verification_results.append("Section Name: Mismatch")
            
            original_content_length = len(original_data['content'])
            retrieved_content_length = len(retrieved_document.content.raw_bytes)
            if original_content_length == retrieved_content_length:
                verification_results.append(f"Content: Length Matched ({original_content_length} bytes)")
            else:
                verification_results.append(f"Content: Length Mismatch (Original: {original_content_length}, Retrieved: {retrieved_content_length})")
            
            return ", ".join(verification_results)
        except Exception as e:
            return f"Verification failed: {str(e)}"

    def upload_documents(self, directory, max_workers=5):
        self.create_datastore()
        # Engine creation is commented out
        # self.create_engine()

        file_paths = [os.path.join(directory, f) for f in os.listdir(directory) if f.endswith('.json')]
        total_files = len(file_paths)

        results = []
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_to_file = {executor.submit(self.upload_document, file_path): file_path for file_path in file_paths}
            
            with tqdm(total=total_files, desc="Uploading documents") as pbar:
                for future in as_completed(future_to_file):
                    file_path = future_to_file[future]
                    try:
                        result = future.result()
                        results.append(result)
                    except Exception as e:
                        results.append(f"Error processing {file_path}: {str(e)}")
                    pbar.update(1)

        return results

def main():
    project_id = "gemini-med-lit-review"
    collection = "default_collection"
    data_store_id = "fda-title21_6"
    processed_documents_dir = "processed_documents"

    uploader = DatastoreUploader(project_id, collection, data_store_id)
    results = uploader.upload_documents(processed_documents_dir)

    print("\nUpload Results:")
    for result in results:
        print(result)

if __name__ == "__main__":
    main()
