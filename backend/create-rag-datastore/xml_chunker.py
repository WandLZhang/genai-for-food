import os
import xml.etree.ElementTree as ET
import json
import hashlib

class XMLProcessor:
    def __init__(self, output_directory):
        self.output_directory = output_directory
        if not os.path.exists(output_directory):
            os.makedirs(output_directory)

    def generate_document_id(self, section_id: str, section_name: str) -> str:
        clean_section_id = ''.join(c for c in section_id if c.isalnum())
        
        if not clean_section_id or not clean_section_id[0].isalpha():
            clean_section_id = 'S' + clean_section_id
        
        combined = f"{clean_section_id}_{section_name}"
        
        if len(combined) <= 63:
            return combined
        
        hash_object = hashlib.md5(combined.encode())
        hash_str = hash_object.hexdigest()
        
        return f"{clean_section_id[:7]}_{hash_str}"[:63]

    def explore(self, element: ET.Element) -> str:
        content = element.text or ""
        for child in element:
            content += self.explore(child)
            if child.tail:
                content += child.tail
        return content

    def process_xml(self, xml_file_path):
        tree = ET.parse(xml_file_path)
        root = tree.getroot()
        
        document_chunks = {}
        visited = set()

        def process_div(div, parent_names=None):
            if parent_names is None:
                parent_names = []

            head = div.find("HEAD")
            if head is not None and head.text:
                current_name = head.text.strip()
                names = parent_names + [current_name]
            else:
                names = parent_names

            if div.attrib.get("TYPE") == "SECTION":
                section_id = div.attrib.get("N", "")
                if section_id and section_id not in visited:
                    visited.add(section_id)
                    content = self.explore(div)
                    section_name = " - ".join(names)
                    document_id = self.generate_document_id(section_id, section_name)
                    document_chunks[document_id] = {
                        "id": document_id,
                        "section_id": section_id,
                        "section_name": section_name,
                        "content": content
                    }
            else:
                for child_div in div:
                    if child_div.tag.startswith("DIV"):
                        process_div(child_div, names)

        for div1 in root.findall("DIV1"):
            process_div(div1)

        return document_chunks

    def save_documents(self, document_chunks):
        for doc_id, doc_content in document_chunks.items():
            file_path = os.path.join(self.output_directory, f"{doc_id}.json")
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(doc_content, f, ensure_ascii=False, indent=2)
            print(f"Saved document: {file_path}")

    def process_and_save(self, xml_file_path):
        chunks = self.process_xml(xml_file_path)
        self.save_documents(chunks)

if __name__ == "__main__":
    xml_file_path = "title21.xml"
    output_directory = "processed_documents"

    processor = XMLProcessor(output_directory)
    processor.process_and_save(xml_file_path)