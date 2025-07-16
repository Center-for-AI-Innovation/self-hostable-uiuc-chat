import os
from typing import List
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests
from injector import inject
from langchain.embeddings.openai import OpenAIEmbeddings
from langchain.vectorstores import Qdrant
from qdrant_client import QdrantClient, models
from qdrant_client.http.models import FieldCondition, MatchAny, MatchValue


class VectorDatabase():
  """
  Contains all methods for building and using vector databases.
  """

  @inject
  def __init__(self):
    """
    Initialize AWS S3, Qdrant, and Supabase.
    """
    # vector DB
    self.qdrant_client = QdrantClient(
        url=os.environ['QDRANT_URL'],
        api_key=os.environ['QDRANT_API_KEY'],
        port=os.getenv('QDRANT_PORT') if os.getenv('QDRANT_PORT') else None,
        timeout=20,  # default is 5 seconds. Getting timeout errors w/ document groups.
    )

    self.vyriad_qdrant_client = QdrantClient(url=os.environ['VYRIAD_QDRANT_URL'],
                                             port=int(os.environ['VYRIAD_QDRANT_PORT']),
                                             https=True,
                                             api_key=os.environ['VYRIAD_QDRANT_API_KEY'])

    try:
      # No major uptime guarantees
      self.cropwizard_qdrant_client = QdrantClient(url="https://cropwizard-qdrant.ncsa.ai",
                                                   port=443,
                                                   https=True,
                                                   api_key=os.environ['QDRANT_API_KEY'])
    except Exception as e:
      print(f"Error in cropwizard_qdrant_client: {e}")
      self.cropwizard_qdrant_client = None

    self.vectorstore = Qdrant(client=self.qdrant_client,
                              collection_name=os.environ['QDRANT_COLLECTION_NAME'],
                              embeddings=OpenAIEmbeddings(openai_api_key=os.environ['VLADS_OPENAI_KEY']))

  def vector_search(self, search_query, course_name, doc_groups: List[str], user_query_embedding, top_n,
                    disabled_doc_groups: List[str], public_doc_groups: List[dict]):
    """
    Search the vector database for a given query.
    """
    # Search the vector database
    search_results = self.qdrant_client.search(
        collection_name=os.environ['QDRANT_COLLECTION_NAME'],
        query_filter=self._create_search_filter(course_name, doc_groups, disabled_doc_groups, public_doc_groups),
        with_vectors=False,
        query_vector=user_query_embedding,
        limit=top_n,  # Return n closest points
        # In a system with high disk latency, the re-scoring step may become a bottleneck: https://qdrant.tech/documentation/guides/quantization/
        search_params=models.SearchParams(quantization=models.QuantizationSearchParams(rescore=False)))
    # print(f"Search results: {search_results}")
    return search_results

  def cropwizard_vector_search(self, search_query, course_name, doc_groups: List[str], user_query_embedding, top_n,
                               disabled_doc_groups: List[str], public_doc_groups: List[dict]):
    """
    Search the vector database for a given query.
    """
    top_n = 120

    search_results = self.cropwizard_qdrant_client.search(
        collection_name='cropwizard',
        query_filter=self._create_search_filter(course_name, doc_groups, disabled_doc_groups, public_doc_groups),
        with_vectors=False,
        query_vector=user_query_embedding,
        limit=top_n,  # Return n closest points
    )

    return search_results

  def patents_vector_search(self, search_query, course_name, doc_groups: List[str], user_query_embedding, top_n,
                            disabled_doc_groups: List[str], public_doc_groups: List[dict]):
    """
    Search the vector database for a given query.
    """
    top_n = 120

    search_results = self.vyriad_qdrant_client.search(
        collection_name='patents',  # Patents embeddings
        with_vectors=False,
        query_vector=user_query_embedding,
        limit=top_n,  # Return n closest points
    )

    # Post-process the Qdrant results, format the results
    try:
      updated_results = []
      for result in search_results:
        result.payload['page_content'] = result.payload['text']
        result.payload['readable_filename'] = "Patent: " + result.payload['s3_path'].split("/")[-1].replace('.txt', '')
        result.payload['course_name'] = course_name
        result.payload['url'] = result.payload['uspto_url']
        result.payload['s3_path'] = result.payload['s3_path']
        updated_results.append(result)
      return updated_results

    except Exception as e:
      print(f"Error in patents_vector_search: {e}")
      return []

  def pubmed_vector_search(self, search_query, course_name, doc_groups: List[str], user_query_embedding, top_n,
                           disabled_doc_groups: List[str], public_doc_groups: List[dict]):
    """
    Search the vector database for a given query.
    """
    # Search the vector database
    search_results = self.vyriad_qdrant_client.search(
        collection_name='pubmed',  # Pubmed embeddings
        with_vectors=False,
        query_vector=user_query_embedding,
        limit=120,  # Return n closest points
    )

    # Post process the Qdrant results, format the results
    try:
      updated_results = []
      for result in search_results:
        result.payload['page_content'] = result.payload['page_content']
        result.payload['readable_filename'] = result.payload['readable_filename']
        result.payload['s3_path'] = result.payload['s3_path']
        result.payload['pagenumber'] = result.payload['pagenumber']
        result.payload['course_name'] = course_name
        updated_results.append(result)
      return updated_results

    except Exception as e:
      print(f"Error in pubmed_vector_search: {e}")
      return []

  def vyriad_vector_search(self, search_query, course_name, doc_groups: List[str], user_query_embedding, top_n,
                           disabled_doc_groups: List[str], public_doc_groups: List[dict]):
    """
    Search the vector database for a given query, combining results from pubmed, patents, ncbi_books, and clinicaltrials collections.
    """
    top_n = 50

    def search_pubmed():
      """Search pubmed collection with error handling"""
      try:
        results = self.vyriad_qdrant_client.search(
            collection_name='pubmed',
            with_vectors=False,
            query_vector=user_query_embedding,
            limit=top_n,
        )
        return results
      except Exception as e:
        print(f"Error searching pubmed: {e}")
        return []

    def search_patents():
      """Search patents collection with error handling"""
      try:
        results = self.vyriad_qdrant_client.search(
            collection_name='patents',
            with_vectors=False,
            query_vector=user_query_embedding,
            limit=top_n,
        )
        return results
      except Exception as e:
        print(f"Error searching patents: {e}")
        return []

    def search_ncbi_books():
      """Search ncbi_books collection with error handling"""
      try:
        results = self.vyriad_qdrant_client.search(
            collection_name='ncbi_pdfs',
            with_vectors=False,
            query_vector=user_query_embedding,
            limit=top_n,
        )
        return results
      except Exception as e:
        print(f"Error searching ncbi_books: {e}")
        return []

    def search_clinicaltrials():
      """Search clinicaltrials collection with error handling"""
      try:
        results = self.vyriad_qdrant_client.search(
            collection_name='clinical-file',
            with_vectors=False,
            query_vector=user_query_embedding,
            limit=top_n,
        )
        return results
      except Exception as e:
        print(f"Error searching clinicaltrials: {e}")
        return []

    # Execute all searches in parallel
    with ThreadPoolExecutor(max_workers=4) as executor:
      future_to_collection = {
          executor.submit(search_pubmed): 'pubmed',
          executor.submit(search_patents): 'patents',
          executor.submit(search_ncbi_books): 'ncbi_books',
          executor.submit(search_clinicaltrials): 'clinicaltrials'
      }

      results = {}
      for future in as_completed(future_to_collection):
        collection_name = future_to_collection[future]
        try:
          results[collection_name] = future.result()
        except Exception as e:
          print(f"Error getting results for {collection_name}: {e}")
          results[collection_name] = []

    # Process results from each collection
    def process_pubmed_results(results):
      """Process pubmed results"""
      updated_results = []
      for result in results:
        result.payload['page_content'] = result.payload['page_content']
        result.payload['readable_filename'] = result.payload['readable_filename']
        result.payload['s3_path'] = result.payload['s3_path']
        result.payload['pagenumber'] = result.payload['pagenumber']
        result.payload['course_name'] = course_name
        updated_results.append(result)
      return updated_results

    def process_patents_results(results):
      """Process patents results"""
      updated_results = []
      for result in results:
        result.payload['page_content'] = result.payload['text']
        result.payload['readable_filename'] = "Patent: " + result.payload['s3_path'].split("/")[-1].replace('.txt', '')
        result.payload['course_name'] = course_name
        result.payload['url'] = result.payload['uspto_url']
        result.payload['s3_path'] = result.payload['s3_path']
        updated_results.append(result)
      return updated_results

    def process_ncbi_books_results(results):
      """Process ncbi_books results"""
      updated_results = []
      for result in results:
        result.payload['page_content'] = result.payload['page_content']
        result.payload['readable_filename'] = result.payload['readable_filename']
        result.payload['s3_path'] = result.payload['s3_path']
        result.payload['pagenumber'] = result.payload['pagenumber']
        result.payload['course_name'] = course_name
        updated_results.append(result)
      return updated_results

    def process_clinicaltrials_results(results):
      """Process clinicaltrials results"""
      updated_results = []
      for result in results:
        result.payload['page_content'] = result.payload['page_content']
        result.payload['readable_filename'] = result.payload['readable_filename']
        result.payload['s3_path'] = result.payload['s3_path']
        result.payload['pagenumber'] = result.payload['pagenumber']
        result.payload['course_name'] = course_name
        updated_results.append(result)
      return updated_results

    try:
      # Process all results in parallel
      with ThreadPoolExecutor(max_workers=4) as executor:
        future_to_processor = {
            executor.submit(process_pubmed_results, results['pubmed']): 'pubmed',
            executor.submit(process_patents_results, results['patents']): 'patents',
            executor.submit(process_ncbi_books_results, results['ncbi_books']): 'ncbi_books',
            executor.submit(process_clinicaltrials_results, results['clinicaltrials']): 'clinicaltrials'
        }

        processed_results = {}
        for future in as_completed(future_to_processor):
          collection_name = future_to_processor[future]
          try:
            processed_results[collection_name] = future.result()
          except Exception as e:
            print(f"Error processing {collection_name}: {e}")
            processed_results[collection_name] = []

      # Combine all results
      updated_pubmed_results = processed_results['pubmed']
      updated_patents_results = processed_results['patents']
      updated_ncbi_books_results = processed_results['ncbi_books']
      updated_clinicaltrials_results = processed_results['clinicaltrials']

      combined_results = updated_pubmed_results + updated_patents_results + updated_ncbi_books_results + updated_clinicaltrials_results

      # Sort combined results by score (higher score = better match)
      combined_results.sort(key=lambda x: x.score, reverse=True)

      print(f"Final combined results: {len(combined_results)} total documents")
      print(f"Pubmed: {len(updated_pubmed_results)}, Patents: {len(updated_patents_results)}, NCBI Books: {len(updated_ncbi_books_results)}, Clinical Trials: {len(updated_clinicaltrials_results)}")

      # Return combined results (remove the top_n limit to return all results)
      return combined_results

    except Exception as e:
      print(f"Error in vyriad_vector_search: {e}")
      return []

  def _create_search_filter(self, course_name: str, doc_groups: List[str], admin_disabled_doc_groups: List[str],
                            public_doc_groups: List[dict]) -> models.Filter:
    """
    Create search conditions for the vector search.
    """

    must_conditions = []
    should_conditions = []

    # Exclude admin-disabled doc_groups
    must_not_conditions = []
    if admin_disabled_doc_groups:
      must_not_conditions.append(FieldCondition(key='doc_groups', match=MatchAny(any=admin_disabled_doc_groups)))

    # Handle public_doc_groups
    if public_doc_groups:
      for public_doc_group in public_doc_groups:
        if public_doc_group['enabled']:
          # Create a combined condition for each public_doc_group
          combined_condition = models.Filter(must=[
              FieldCondition(key='course_name', match=MatchValue(value=public_doc_group['course_name'])),
              FieldCondition(key='doc_groups', match=MatchAny(any=[public_doc_group['name']]))
          ])
          should_conditions.append(combined_condition)

    # Handle user's own course documents
    own_course_condition = models.Filter(must=[FieldCondition(key='course_name', match=MatchValue(value=course_name))])

    # If specific doc_groups are specified
    if doc_groups and 'All Documents' not in doc_groups:
      own_course_condition.must.append(FieldCondition(key='doc_groups', match=MatchAny(any=doc_groups)))

    # Add the own_course_condition to should_conditions
    should_conditions.append(own_course_condition)

    # Construct the final filter
    vector_search_filter = models.Filter(should=should_conditions, must_not=must_not_conditions)

    print(f"Vector search filter: {vector_search_filter}")
    return vector_search_filter

  def _create_conversation_filter(self, conversation_id: str) -> models.Filter:
    """
    Create a filter for conversation-specific documents.
    """
    return models.Filter(
        must=[
            FieldCondition(
                key='conversation_id',
                match=MatchValue(value=conversation_id)
            )
        ]
    )

  def _combine_filters(self, search_filter: models.Filter, conversation_filter: models.Filter) -> models.Filter:
    """
    Combine search filter with conversation filter using OR logic.
    This allows searching both regular course documents AND conversation-specific documents.
    """
    return models.Filter(
        should=[search_filter, conversation_filter]
    )

  def vector_search_with_filter(self, search_query, course_name, doc_groups: List[str], 
                               user_query_embedding, top_n, disabled_doc_groups: List[str], 
                               public_doc_groups: List[dict], custom_filter: models.Filter):
    """
    Search the vector database with a custom filter.
    Used for conversation-specific document filtering.
    """
    search_results = self.qdrant_client.search(
        collection_name=os.environ['QDRANT_COLLECTION_NAME'],
        query_filter=custom_filter,
        with_vectors=False,
        query_vector=user_query_embedding,
        limit=top_n,
        search_params=models.SearchParams(
            quantization=models.QuantizationSearchParams(rescore=False)
        )
    )
    return search_results

  def delete_data(self, collection_name: str, key: str, value: str):
    """
    Delete data from the vector database.
    """
    return self.qdrant_client.delete(
        collection_name=collection_name,
        wait=True,
        points_selector=models.Filter(must=[
            models.FieldCondition(
                key=key,
                match=models.MatchValue(value=value),
            ),
        ]),
    )

  def delete_data_cropwizard(self, key: str, value: str):
    """
    Delete data from the vector database.
    """
    return self.cropwizard_qdrant_client.delete(
        collection_name='cropwizard',
        wait=True,
        points_selector=models.Filter(must=[
            models.FieldCondition(
                key=key,
                match=models.MatchValue(value=value),
            ),
        ]),
    )
