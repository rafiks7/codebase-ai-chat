from flask import Flask, jsonify, request

from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity
from langchain_pinecone import PineconeVectorStore
from langchain.embeddings import OpenAIEmbeddings
from langchain_community.embeddings import HuggingFaceEmbeddings
from pinecone import Pinecone
import os
import tempfile
from github import Github, Repository
from git import Repo
from openai import OpenAI
from pathlib import Path
from langchain.schema import Document
from pinecone import Pinecone
from dotenv import load_dotenv
from flask_cors import CORS
import shutil

# Load environment variables from .env.local
if load_dotenv('.env.local'):
    print(".env.local loaded successfully.")
else:
    print("Failed to load .env.local.")

app = Flask(__name__)

CORS(app)


# Supported files
SUPPORTED_EXTENSIONS = {'.py', '.js', '.tsx', '.jsx', '.ipynb', '.java',
                         '.cpp', '.ts', '.go', '.rs', '.vue', '.swift', '.c', '.h'}

IGNORED_DIRS = {'node_modules', 'venv', 'env', 'dist', 'build', '.git',
                '__pycache__', '.next', '.vscode', 'vendor'}


# Initialize Pinecone
pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))

# Connect to your Pinecone index
pinecone_index = pc.Index("codebase-rag")

# GROQ client
client = OpenAI(
    base_url="https://api.groq.com/openai/v1",
    api_key=os.getenv("GROQ_API_KEY")
    )

def clone_repo(repo_url):
    print('repo_url', repo_url)
    repo_name = repo_url.split("/")[-1]  # Extract repository name from URL
    print('repo_name', repo_name)
    repo_path = f"repos/{repo_name}"  # Append a timestamp to the repo name
    print('repo_path', repo_path)

    # Check if the directory already exists
    if os.path.exists(repo_path):
        print('directory exists alread :(')
        return

    try:
        Repo.clone_from(repo_url, str(repo_path))
        print('repo cloned!')
    except Exception as e:
        print(f"Error cloning repository: {str(e)}")
        return
    
    return str(repo_path)

    
def get_file_content(file_path, repo_path):
    """
    Get content of a single file.

    Args:
        file_path (str): Path to the file

    Returns:
        Optional[Dict[str, str]]: Dictionary with file name and content
    """
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()

        # Get relative path from repo root
        rel_path = os.path.relpath(file_path, repo_path)

        return {
            "name": rel_path,
            "content": content
        }
    except Exception as e:
        print(f"Error processing file {file_path}: {str(e)}")
        return None

def get_main_files_content(repo_path: str):
    """
    Get content of supported code files from the local repository.

    Args:
        repo_path: Path to the local repository

    Returns:
        List of dictionaries containing file names and contents
    """
    files_content = []

    try:
        for root, _, files in os.walk(repo_path):
            # Skip if current directory is in ignored directories
            if any(ignored_dir in root for ignored_dir in IGNORED_DIRS):
                print(f"Skipping directory: {root}")
                continue

            # Process each file in current directory
            for file in files:
                file_path = os.path.join(root, file)
                if os.path.splitext(file)[1] in SUPPORTED_EXTENSIONS:
                    file_content = get_file_content(file_path, repo_path)
                    if file_content:
                        files_content.append(file_content)
                        print('file added: ', file)

    except Exception as e:
        print(f"Error reading repository: {str(e)}")
        
        # Delete the cloned repository
        try:
            shutil.rmtree(repo_path)  # Remove the directory
            # os.system(f"rmdir /S /Q {repo_path}")
            print(f'Repository at {repo_path} deleted successfully.')
        except PermissionError as e:
            print(f"Permission denied while trying to delete {repo_path}: {str(e)}")
        except Exception as e:
            print(f"Error while deleting repository at {repo_path}: {str(e)}")
        

    return files_content

def upsert_to_pinecone(files_content, repo_url, repo_path):
    try:
        documents = []

        for file in files_content:
            doc = Document(
                page_content=f"{file['name']}\n{file['content']}",
                metadata={"source": file['name']}
            )

            documents.append(doc)

        vectorstore = PineconeVectorStore.from_documents(
            documents=documents,
            embedding=HuggingFaceEmbeddings(model_name="sentence-transformers/all-mpnet-base-v2"),
            index_name="codebase-rag",
            namespace=repo_url
        )
    except Exception as e:
        print(f"error while uploading embeddings to pinecone: {str(e)}")
        
        # Delete the cloned repository
        shutil.rmtree(repo_path)  # Remove the directory
        print(f'Repository at {repo_path} deleted successfully.')



# clone repo endpoint
@app.route('/api/embed-repo', methods=['GET'])
def embed_repository():
    try:
        # Cloning the repo
        print('cloning repo')
        repo_url = request.args.get('repo_url')
        repo_path = clone_repo(repo_url)
        if not repo_path:
            return jsonify({"error": "Failed to clone repository."}), 400
        print('repo is cloned at: ', repo_path)

        # Parsing the files
        files_content = get_main_files_content(repo_path)
        if not files_content:
            return jsonify({"error": "No supported files found in the repository."}), 404

        # embed repo into pinecone
        upsert_to_pinecone(files_content, repo_url, repo_path)
        print('embeddings inserted to pinecone!')

        # Delete the cloned repository
        shutil.rmtree(repo_path)  # Remove the directory
        print(f'Repository at {repo_path} deleted successfully.')

        return jsonify({"message": "Repository embedded successfully."}), 200

    except Exception as e:
        print(f"Error in embed_repository: {str(e)}")
        return jsonify({"error": str(e)}), 500


def get_huggingface_embeddings(text, model_name="sentence-transformers/all-mpnet-base-v2"):
    model = SentenceTransformer(model_name)
    return model.encode(text)

# get context endpoint
@app.route('/api/rag', methods=['GET'])
def perform_rag():

    # query from request
    # repo url from request
    raw_query_embedding = get_huggingface_embeddings(query)

    top_matches = pinecone_index.query(vector=raw_query_embedding.tolist(), top_k=5, include_metadata=True, namespace=repo_url)

    # Get the list of retrieved texts
    contexts = [item['metadata']['text'] for item in top_matches['matches']]

    augmented_query = "<CONTEXT>\n" + "\n\n-------\n\n".join(contexts[ : 10]) + "\n-------\n</CONTEXT>\n\n\n\nMY QUESTION:\n" + query

    # Modify the prompt below as need to improve the response quality
    system_prompt = f"""You are a Senior Software Engineer, specializing in TypeScript.

    Answer any questions I have about the codebase, based on the code provided. Always consider all of the context provided when forming a response.
    """

    llm_response = client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": augmented_query}
        ]
    )

    return llm_response.choices[0].message.content

if __name__ == '__main__':
    app.run(debug=True)
    print('Server ')