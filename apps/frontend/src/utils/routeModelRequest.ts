import posthog from 'posthog-js'
import { runBedrockChat } from '~/app/utils/bedrock'
import { runGeminiChat } from '~/utils/modelProviders/routes/gemini'
import { runSambaNovaChat } from '~/app/utils/sambanova'
import { runAnthropicChat } from '~/app/utils/anthropic'
import { runOllamaChat } from '~/app/utils/ollama'
import { runVLLM } from '~/app/utils/vllm'
import { runOpenAICompatibleChat } from '~/app/utils/openaiCompatible'
import { type ChatBody } from '~/types/chat'
import {
  type AnthropicProvider,
  type BedrockProvider,
  type GeminiProvider,
  type OllamaProvider,
  type OpenAICompatibleProvider,
  type SambaNovaProvider,
} from '~/utils/modelProviders/LLMProvider'
import { AzureModelID } from './modelProviders/azure'
import { OllamaModelIDs } from './modelProviders/ollama'
import { openAIAzureChat } from './modelProviders/OpenAIAzureChat'
import { AnthropicModelID } from './modelProviders/types/anthropic'
import { BedrockModelID } from './modelProviders/types/bedrock'
import { GeminiModelID } from './modelProviders/types/gemini'
import { NCSAHostedVLMModelID } from './modelProviders/types/NCSAHostedVLM'
import { OpenAIModelID } from './modelProviders/types/openai'
import { SambaNovaModelID } from './modelProviders/types/SambaNova'

export const routeModelRequest = async (
  chatBody: ChatBody,
  controller?: AbortController,
  baseUrl?: string,
): Promise<any> => {
  /*  Use this to call the LLM. It will call the appropriate endpoint based on the conversation.model.
  🧠 ADD NEW LLM PROVIDERS HERE 🧠
  NOTE: WebLLM is handled separately, because it MUST be called from the Client browser itself. 
  */

  // console.debug('In routeModelRequest: ', chatBody, baseUrl)
  // console.debug('In routeModelRequest: ', baseUrl)

  const selectedConversation = chatBody.conversation!
  // console.debug('Selected conversation:', selectedConversation)
  if (!selectedConversation.model || !selectedConversation.model.id) {
    console.debug('Invalid conversation:', selectedConversation)
    throw new Error('Conversation model is undefined or missing "id" property.')
  }

  posthog.capture('LLM Invoked', {
    distinct_id: selectedConversation.userEmail
      ? selectedConversation.userEmail
      : 'anonymous',
    user_id: selectedConversation.userEmail
      ? selectedConversation.userEmail
      : 'anonymous',
    conversation_id: selectedConversation.id,
    model_id: selectedConversation.model.id,
  })

  if (
    chatBody?.llmProviders?.OpenAICompatible?.enabled &&
    (chatBody.llmProviders.OpenAICompatible.models || []).some(
      (m) =>
        m.enabled &&
        m.id.toLowerCase() === selectedConversation.model.id.toLowerCase(),
    )
  ) {
    return await runOpenAICompatibleChat(
      selectedConversation,
      chatBody.llmProviders.OpenAICompatible as OpenAICompatibleProvider,
      chatBody.stream,
    )
  } else if (
    Object.values(NCSAHostedVLMModelID).includes(
      selectedConversation.model.id as any,
    )
  ) {
    // NCSA Hosted VLM
    return await runVLLM(selectedConversation, chatBody.stream)
  } else if (
    Object.values(OllamaModelIDs).includes(selectedConversation.model.id as any)
  ) {
    // Ollama
    return await runOllamaChat(
      selectedConversation,
      chatBody!.llmProviders!.Ollama as OllamaProvider,
      chatBody.stream,
    )
  } else if (
    Object.values(AnthropicModelID).includes(
      selectedConversation.model.id as any,
    )
  ) {
    return await runAnthropicChat(
      selectedConversation,
      chatBody.llmProviders?.Anthropic as AnthropicProvider,
      chatBody.stream,
    )
  } else if (
    Object.values(OpenAIModelID).includes(
      selectedConversation.model.id as any,
    ) ||
    Object.values(AzureModelID).includes(selectedConversation.model.id as any)
  ) {
    return await openAIAzureChat(chatBody, chatBody.stream)
  } else if (
    Object.values(BedrockModelID).includes(selectedConversation.model.id as any)
  ) {
    return await runBedrockChat(
      selectedConversation,
      chatBody.llmProviders?.Bedrock as BedrockProvider,
      chatBody.stream,
    )
  } else if (
    Object.values(GeminiModelID).includes(selectedConversation.model.id as any)
  ) {
    return await runGeminiChat(
      selectedConversation,
      chatBody.llmProviders?.Gemini as GeminiProvider,
      chatBody.stream,
    )
  } else if (
    Object.values(SambaNovaModelID).includes(
      selectedConversation.model.id as any,
    )
  ) {
    return await runSambaNovaChat(
      selectedConversation,
      chatBody.llmProviders?.SambaNova as SambaNovaProvider,
      chatBody.stream,
    )
  } else {
    throw new Error(
      `Model '${selectedConversation.model.name}' is not supported.`,
    )
  }
}
