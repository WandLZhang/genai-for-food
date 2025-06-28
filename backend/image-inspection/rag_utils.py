import logging
from google.api_core.client_options import ClientOptions
from google.cloud import discoveryengine
from google.api_core import retry
from google.api_core.exceptions import NotFound, PermissionDenied, ResourceExhausted

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

PROJECT_ID = "gemini-med-lit-review"
LOCATION = "global"
DATA_STORE_ID = "fda-title21_6"

client_options = ClientOptions(api_endpoint=f"{LOCATION}-discoveryengine.googleapis.com")
search_client = discoveryengine.SearchServiceClient(client_options=client_options)
doc_client = discoveryengine.DocumentServiceClient(client_options=client_options)

def search_datastore(query: str, data_store_id: str) -> list:
    serving_config = search_client.serving_config_path(
        project=PROJECT_ID,
        location=LOCATION,
        data_store=data_store_id,
        serving_config="default_config",
    )

    request = discoveryengine.SearchRequest(
        serving_config=serving_config,
        query=query,
        page_size=10,
        query_expansion_spec=discoveryengine.SearchRequest.QueryExpansionSpec(
            condition=discoveryengine.SearchRequest.QueryExpansionSpec.Condition.AUTO
        ),
        spell_correction_spec=discoveryengine.SearchRequest.SpellCorrectionSpec(
            mode=discoveryengine.SearchRequest.SpellCorrectionSpec.Mode.AUTO
        )
    )

    try:
        response = search_client.search(request)
        logging.info(f"Search returned {len(response.results)} results")
        return response.results
    except Exception as e:
        logging.error(f"Error during search: {str(e)}")
        return []

def get_document_by_id(doc_id: str, data_store_id: str) -> discoveryengine.Document:
    parent = f"projects/{PROJECT_ID}/locations/{LOCATION}/collections/default_collection/dataStores/{data_store_id}/branches/default_branch"
    name = f"{parent}/documents/{doc_id}"
    try:
        document = doc_client.get_document(name=name)
        logging.info(f"Successfully retrieved document: {doc_id}")
        return document
    except NotFound:
        logging.error(f"Document not found: {doc_id}")
    except Exception as e:
        logging.error(f"Error retrieving document {doc_id}: {str(e)}")
    return None

def extract_safe(obj: object, *keys: str) -> object:
    for key in keys:
        if isinstance(obj, dict):
            obj = obj.get(key)
        elif hasattr(obj, key):
            obj = getattr(obj, key)
        else:
            return None
    return obj

def process_search_results(search_results: list, target_string: str) -> list:
    matching_documents = []
    for i, result in enumerate(search_results):
        logging.debug(f"Processing search result {i+1}: {result}")

        doc_id = extract_safe(result, 'document', 'id')
        full_doc = get_document_by_id(doc_id, DATA_STORE_ID)
        
        if full_doc and full_doc.content and full_doc.content.raw_bytes:
            content = full_doc.content.raw_bytes.decode('utf-8')
            section_id = full_doc.struct_data.get('section_id', 'N/A')
            section_name = full_doc.struct_data.get('section_name', 'N/A')
            
            if any(word.lower() in content.lower() for word in target_string.split()):
                matching_documents.append({
                    'id': doc_id,
                    'section_id': section_id,
                    'section': section_name,
                    'content': content
                })
        else:
            logging.warning(f"No content found for document {doc_id}")

    return matching_documents

def get_relevant_codes(query: str, data_store_id: str) -> str:
    search_results = search_datastore(query, data_store_id)
    matching_documents = process_search_results(search_results, query)
    
    relevant_codes = []
    for doc in matching_documents:
        relevant_codes.append(f"Section {doc['section_id']}: {doc['content']}")
    
    return "\n".join(relevant_codes)
