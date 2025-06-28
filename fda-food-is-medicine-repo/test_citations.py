import requests
import json

# Test the image analysis endpoint with citations
def test_image_analysis():
    url = 'http://localhost:5000/img_analysis'
    
    # Use one of the test images
    image_path = 'back/yogurt.jpeg'
    
    with open(image_path, 'rb') as f:
        files = {'evidence_file': ('yogurt.jpeg', f, 'image/jpeg')}
        data = {
            'user_settings': 'I am 30 years old, female',
            'user_preferences': 'No allergies\nVegetarian'
        }
        
        print("Sending request to analyze yogurt image...")
        response = requests.post(url, files=files, data=data)
        
        if response.status_code == 200:
            result = response.json()
            print("\n✅ Analysis Results:")
            print("-" * 50)
            print(f"Health Rating: {result.get('healthRating', 'N/A')}")
            print(f"\nHealth Summary: {result.get('healthSummary', 'N/A')}")
            print(f"\nHealth Citations: {json.dumps(result.get('healthCitations', []), indent=2)}")
            print("-" * 50)
            print(f"Safety Rating: {result.get('safetyRating', 'N/A')}")
            print(f"\nSafety Summary: {result.get('safetySummary', 'N/A')}")
            print(f"\nSafety Citations: {json.dumps(result.get('safetyCitations', []), indent=2)}")
        else:
            print(f"❌ Error: {response.status_code}")
            print(response.text)

if __name__ == "__main__":
    test_image_analysis()
