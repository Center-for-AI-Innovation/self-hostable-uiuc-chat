import inspect
import os
# from xml.dom.minidom import Document  # PDF to text
# from re import L, T
import traceback
from pathlib import Path
from tempfile import NamedTemporaryFile, TemporaryFile
from typing import Any, Dict, List, Literal, Union

import boto3
import fitz
import supabase
from dotenv import load_dotenv
from flask import jsonify, request
from langchain.document_loaders import (Docx2txtLoader, S3DirectoryLoader,
                                        SRTLoader)
from langchain.embeddings.openai import OpenAIEmbeddings
from langchain.schema import Document
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.vectorstores import Qdrant
from qdrant_client import QdrantClient, models

# from regex import F
# from sqlalchemy import JSON

# load API keys from globally-availabe .env file
load_dotenv(dotenv_path='../.env', override=True)

class Ingest():
  """
  Contains all methods for building and using vector databases.
  """

  def __init__(self):
    """
    Initialize AWS S3, Qdrant, and Supabase.
    """

    # vector DB
    self.qdrant_client = QdrantClient(
        url=os.environ['QDRANT_URL'],
        api_key=os.environ['QDRANT_API_KEY'],
    )
    self.vectorstore = Qdrant(client=self.qdrant_client,
                              collection_name=os.environ['QDRANT_COLLECTION_NAME'],
                              embeddings=OpenAIEmbeddings()) # type: ignore

    # S3
    self.s3_client = boto3.client(
        's3',
        aws_access_key_id=os.environ['AWS_ACCESS_KEY_ID'],
        aws_secret_access_key=os.environ['AWS_SECRET_ACCESS_KEY'],
        # aws_session_token=,  # Comment this line if not using temporary credentials
    )

    # Create a Supabase client
    # self.supabase_client = supabase.create_client(supabase_url=os.environ.get('SUPABASE_URL'), supabase_key=os.environ.get('SUPABASE_API_KEY'))

    return None

  def bulk_ingest(self, s3_paths: Union[List[str], str], course_name: str) -> str:
    # https://python.langchain.com/en/latest/modules/indexes/document_loaders/examples/microsoft_word.html
    try:
      if isinstance(s3_paths, str):
        s3_paths = [s3_paths]
        
      # ensure collection exists
      # self.qdrant_client.recreate_collection(
      #     collection_name=os.environ['QDRANT_COLLECTION_NAME'],
      #     vectors_config=models.VectorParams(size=1536, distance=models.Distance.COSINE),
      # )

      for s3_path in s3_paths:
        # print("s3_path", s3_path)
        # todo check each return value for failures. If any fail, send emails.

        if s3_path.endswith('.pdf'):
          self._ingest_single_pdf(s3_path, course_name)
        elif s3_path.endswith('.txt'):
          # self.ingest_text(s3_path, course_name)
          print('Not yet implemented')
        elif s3_path.endswith('.srt'):
          ret = self._ingest_single_srt(s3_path, course_name)
          if ret != "Success":
            print(f"TODO: Send email about failure of this file: {s3_path}")
        elif s3_path.endswith('.docx'):
          ret = self._ingest_single_docx(s3_path, course_name)
          if ret != "Success":
            print(f"TODO: Send email about failure of this file: {s3_path}")
      return "(TODO) Success or failure unknown"
    except Exception as e:
      return f"Error: {e}"

  def _ingest_single_docx(self, s3_path: str, course_name: str) -> str:
    try:
      with NamedTemporaryFile() as tmpfile:
        # download from S3 into pdf_tmpfile
        print("Bucket: ", os.environ['S3_BUCKET_NAME'])
        print("Key: ", s3_path)
        self.s3_client.download_fileobj(Bucket=os.environ['S3_BUCKET_NAME'], Key=s3_path, Fileobj=tmpfile)
        print("GOT THE FILE")
        print(tmpfile.name)

        loader = Docx2txtLoader(tmpfile.name)
        documents = loader.load()

        texts = [doc.page_content for doc in documents]
        metadatas: List[Dict[str,Any]] = [
          {
            'course_name': course_name, 
            's3_path': s3_path,
            'readable_filename': Path(s3_path).stem, 
            'pagenumber_or_timestamp': '', 
          } for doc in documents]

        self.split_and_upload(texts=texts, metadatas=metadatas)
        return "Success"
    except Exception as e:
      print(f"ERROR IN DOCX {e}")
      return f"Error: {e}"

  def _ingest_single_srt(self, s3_path: str, course_name: str) -> str:
    try:
      with NamedTemporaryFile() as tmpfile:
        # download from S3 into pdf_tmpfile
        self.s3_client.download_fileobj(Bucket=os.environ['S3_BUCKET_NAME'], Key=s3_path, Fileobj=tmpfile)

        loader = SRTLoader(tmpfile.name)
        documents = loader.load()

        texts = [doc.page_content for doc in documents]
        metadatas: List[Dict[str,Any]] = [
          {
            'course_name': course_name, 
            's3_path': s3_path,
            'readable_filename': Path(s3_path).stem, 
            'pagenumber_or_timestamp': '', 
          } for doc in documents]

        self.split_and_upload(texts=texts, metadatas=metadatas)
        return "Success"
    except Exception as e:
      print(f"SRT ERROR {e}")
      return f"Error: {e}"

  def _ingest_single_pdf(self, s3_path: str, course_name: str):
    """
    Private method. Use ingest_PDFs() instead.
    
    Both OCR the PDF, and split the text into chunks. Returns chunks as List[Document].
      LangChain `Documents` have .metadata and .page_content attributes.
    Be sure to use TemporaryFile() to avoid memory leaks!
    """
    try:
      with NamedTemporaryFile() as pdf_tmpfile:
        # download from S3 into pdf_tmpfile
        self.s3_client.download_fileobj(Bucket=os.environ['S3_BUCKET_NAME'], Key=s3_path, Fileobj=pdf_tmpfile)
    
        ### READ OCR of PDF
        pdf_pages_OCRed: List[Dict] = []
        for i, page in enumerate(fitz.open(pdf_tmpfile.name)): # type: ignore
          text = page.get_text().encode("utf8").decode('ascii', errors='ignore')  # get plain text (is in UTF-8)
          pdf_pages_OCRed.append(dict(text=text, page_number=i, readable_filename=Path(s3_path).stem))

        metadatas: List[Dict[str,Any]] = [
          {
            'course_name': course_name, 
            's3_path': s3_path,
            'pagenumber_or_timestamp': page['page_number'], 
            'readable_filename': page['readable_filename'], 
          } for page in pdf_pages_OCRed]
        pdf_texts = [page['text'] for page in pdf_pages_OCRed]
        print("PDF READING FUL DOCS:")
        print(metadatas)
        print(pdf_texts)

        self.split_and_upload(texts=pdf_texts, metadatas=metadatas)
    except Exception as e:
      print("ERROR IN PDF READING ")
      print(e)
      return f"Error {e}"
    return "Success"

  def split_and_upload(self, texts: List[str], metadatas: List[Dict[str, Any]]):
    """ This is usually the last step of document ingest. Chunk & upload to Qdrant (and Supabase.. todo).
    Takes in Text and Metadata (from Langchain doc loaders) and splits / uploads to Qdrant.
    
    good examples here: https://langchain.readthedocs.io/en/latest/modules/utils/combine_docs_examples/textsplitter.html

    Args:
        texts (List[str]): _description_
        metadatas (List[Dict[str, Any]]): _description_
    """
    assert len(texts) == len(metadatas), 'must have equal number of text strings and metadata dicts'
    
    try:
      text_splitter = RecursiveCharacterTextSplitter.from_tiktoken_encoder(
          chunk_size=1000,
          chunk_overlap=150,
          separators=". ",  # try to split on sentences... 
      )
      documents: List[Document] = text_splitter.create_documents(texts=texts, metadatas=metadatas)

      def remove_small_contexts(documents: List[Document]) -> List[Document]:
        # Remove TextSplit contexts with fewer than 50 chars.
        return [doc for doc in documents if len(doc.page_content) > 50]

      documents = remove_small_contexts(documents=documents)

      # upload to Qdrant
      self.vectorstore.add_texts([doc.page_content for doc in documents], [doc.metadata for doc in documents])
      return "Success"
    except Exception as e:
      print(f'ERROR IN SPLIT AND UPLOAD {e}')
      return f"Error: {e}"

  
  def getTopContexts(self, search_query: str):
    """Here's a summary of the work.

    /GET arguments
      course name (optional) str: A json response with TBD fields.
      
    Returns
      JSON: A json response with TBD fields. See main.py:getTopContexts docs.
      or 
      String: An error message with traceback.
    """
    try:
      found_docs = self.vectorstore.similarity_search(search_query)
      return self.format_for_json(found_docs)
    except Exception as e:
      # return full traceback to front end
      err: str = f"Traceback: {traceback.extract_tb(e.__traceback__)}❌❌ Error in {inspect.currentframe().f_code.co_name}:{e}" # type: ignore
      print(err)
      return err
    

  def format_for_json(self, found_docs: List[Document]) -> List[Dict]:
    """Formatting only.
      {'course_name': course_name, 'contexts': [{'source_name': 'Lumetta_notes', 'source_location': 'pg. 19', 'text': 'In FSM, we do this...'}, {'source_name': 'Lumetta_notes', 'source_location': 'pg. 20', 'text': 'In Assembly language, the code does that...'},]}

    Args:
        found_docs (List[Document]): _description_

    Raises:
        Exception: _description_

    Returns:
        List[Dict]: _description_
    """

    contexts = [
      {
        'text': doc.page_content,
        'readable_filename': doc.metadata['readable_filename'],
        'course_name ': doc.metadata['course_name'],
        's3_path': doc.metadata['s3_path'],
        'pagenumber_or_timestamp': doc.metadata['pagenumber_or_timestamp'],
      } for doc in found_docs]

    return contexts
