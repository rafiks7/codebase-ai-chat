# from flask import Flask, jsonify, request

# from langchain_pinecone import PineconeVectorStore
# from langchain_openai import OpenAIEmbeddings 
# from pinecone import Pinecone
# import os
# from git import Repo
# from openai import OpenAI
# from pathlib import Path
# from langchain.schema import Document
# from dotenv import load_dotenv
# from flask_cors import CORS
# import shutil
# import stat
# import subprocess
# import json

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

IGNORED_DIRS = {
    'node_modules', 'venv', 'env', 'dist', 'build', '.git', '__pycache__', 
    '.next', '.vscode', 'vendor', '.idea', '.tox', '.nvm', '.docker', 'test', 
    'tests', 'logs', '.history', '.mypy_cache', '.pytest_cache', '.serverless', 
    'tmp', 'cache', '.cache', '.sass-cache', 'bower_components', 'public', 'out', 
    'coverage', 'npm-debug.log', 'yarn-error.log', 'yarn.lock', 'package-lock.json'
}

# Initialize Pinecone
pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))

# Connect to your Pinecone index
pinecone_index = pc.Index("codebase-rag")

# GROQ client
client = OpenAI(
    base_url="https://api.groq.com/openai/v1",
    api_key=os.getenv("GROQ_API_KEY")
    )


def make_writable(path):
    """Make the directory writable if it isn't already"""
    if os.path.exists(path):
        # Make the directory and its contents writable (in case it's read-only)
        for root, dirs, files in os.walk(path):
            for dir in dirs:
                os.chmod(os.path.join(root, dir), stat.S_IWUSR | stat.S_IRUSR | stat.S_IXUSR)
            for file in files:
                os.chmod(os.path.join(root, file), stat.S_IWUSR | stat.S_IRUSR)

def delete_directory(repo_path):
    """Delete the repository directory after ensuring it is writable"""
    try:
        # Ensure the directory is writable before deletion
        make_writable(repo_path)
        
        shutil.rmtree(repo_path)  # Remove the directory
        print(f'Repository at {repo_path} deleted successfully.')
        
    except PermissionError as e:
        print(f'PermissionError: {e} - You may not have the required permissions to delete this directory.')
    except Exception as e:
        print(f"Error while deleting: {str(e)}")


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
        delete_directory(repo_path)
        

    return files_content

def parse_file_content(files):
    
    current_dir = os.path.dirname(os.path.abspath(__file__))

    # Path to your JavaScript file (js_parser.js) in the same directory
    js_file_path = os.path.join(current_dir, 'js_parser.js')

    all_functions = []

    for file in files:
        # Use os.path.splitext to split the file path into root and extension
        print(file['name'])
        extension = os.path.splitext(file['name'])[1]
        result = subprocess.run(['node', js_file_path, file['content']], capture_output=True, text=True)
        if extension in ['.js', '.jsx', '.ts', '.tsx']:
            # Check for any errors in stderr
            if result.stderr:
                print(f"Error from parser: {result.stderr}")
            # Parse the JSON output from stdout
            output = json.loads(result.stdout)

            if output:
                # print("Functions found:", output)
                for func in output:
                    all_functions.append({"name": file['name'], "content": func})
            else:
                print("No functions found.")
                all_functions.append(file)
        else:
            print('extension not supported: ', extension)
            all_functions.append(file)
            continue
    
    return all_functions

def upsert_to_pinecone(files_content, repo_url, repo_path):
    try:
        documents = []

        for file in files_content:
            print('file while upserting to pinecone:', file)
            doc = Document(
                page_content=f"{file['name']}\n{file['content']}",
                metadata={"source": file['name']}
            )

            documents.append(doc)


        # delete namespace if it exists already
        stats = pinecone_index.describe_index_stats(namespace=repo_url)

        # Step 2: If stats are returned, the namespace exists
        if stats.get('namespaces', {}).get(repo_url):
            print(f"Namespace {repo_url} exists. Proceeding to delete.")
            # Delete all vectors in the namespace
            pinecone_index.delete(deleteAll=True, namespace=repo_url)
        else:
            print(f"Namespace {repo_url} does not exist.")


        # Create a PineconeVectorStore instance
        vectorstore = PineconeVectorStore(
            embedding=OpenAIEmbeddings(model="text-embedding-3-small"), 
            index_name="codebase-rag",
            namespace=repo_url
        )

        vectorstore.add_documents(documents)

    except Exception as e:
        print(f"error while uploading embeddings to pinecone: {str(e)}")
        
        # Delete the cloned repository
        delete_directory(repo_path)
    

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

        parsed_content = parse_file_content(files_content)
        
        # embed repo into pinecone
        try:
            upsert_to_pinecone(parsed_content, repo_url, repo_path)
        except Exception as e:
            print("Error while uploading to pinecone:", str(e))

        print('embeddings inserted to pinecone!')

        # Delete the cloned repository
        delete_directory(repo_path)

        return jsonify({"message": "Repository embedded successfully."}), 200

    except Exception as e:
        print(f"Error in embed_repository: {str(e)}")
        delete_directory(repo_path)
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)
    print('Server running ...')