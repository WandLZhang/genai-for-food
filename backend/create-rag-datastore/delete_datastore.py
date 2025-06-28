import os
from google.cloud import discoveryengine
from google.api_core import retry, exceptions
from google.api_core.exceptions import NotFound, PermissionDenied, ResourceExhausted
import time

class DatastoreManager:
    def __init__(self, project_id, location):
        self.project_id = project_id
        self.location = location
        self.client = discoveryengine.DataStoreServiceClient()

    @retry.Retry(predicate=retry.if_exception_type(
        exceptions.DeadlineExceeded,
        exceptions.ServiceUnavailable,
    ))
    def delete_datastore(self, collection, data_store_id):
        parent = f"projects/{self.project_id}/locations/global/collections/{collection}"
        data_store_name = f"{parent}/dataStores/{data_store_id}"
        
        print(f"Attempting to delete Data Store: {data_store_name}")
        
        try:
            operation = self.client.delete_data_store(name=data_store_name)
            
            # Poll the operation
            timeout = 300  # 5 minutes timeout
            start_time = time.time()
            while not operation.done():
                if time.time() - start_time > timeout:
                    raise TimeoutError("Operation timed out")
                time.sleep(5)  # Wait for 5 seconds before checking again
            
            if operation.error:
                print(f"Error deleting Data Store {data_store_id}: {operation.error}")
                return False
            else:
                print(f"Data Store {data_store_id} successfully deleted.")
                return True
        except NotFound:
            print(f"Data Store {data_store_id} not found. Skipping deletion.")
            return False
        except PermissionDenied:
            print(f"Permission denied to delete Data Store {data_store_id}. Please check your credentials and permissions.")
            return False
        except ResourceExhausted:
            print(f"Resource quota exceeded while trying to delete Data Store {data_store_id}. Please check your project quotas.")
            return False
        except TimeoutError:
            print(f"Operation timed out while deleting Data Store {data_store_id}.")
            return False
        except Exception as e:
            print(f"Unexpected error occurred while deleting Data Store {data_store_id}: {str(e)}")
            return False

def main():
    project_id = "gemini-med-lit-review"
    location = "us-central1"
    collection = "default_collection"
    datastores_to_delete = ["fda-title21", "fda-title21_content_required"]

    manager = DatastoreManager(project_id, location)

    for datastore_id in datastores_to_delete:
        success = manager.delete_datastore(collection, datastore_id)
        if success:
            print(f"Successfully deleted datastore: {datastore_id}")
        else:
            print(f"Failed to delete datastore: {datastore_id}")

if __name__ == "__main__":
    main()
