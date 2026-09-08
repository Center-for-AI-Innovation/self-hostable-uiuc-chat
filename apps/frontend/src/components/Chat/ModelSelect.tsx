import {
  IconChevronDown,
  IconCircleCheck,
  IconDownload,
  IconExternalLink,
  IconSparkles,
  IconAlertTriangle,
  IconInfoCircle,
} from '@tabler/icons-react'
import {
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import { useMediaQuery, useViewportSize } from '@mantine/hooks'
import HomeContext from '~/components/home/home.context'
import { montserrat_heading, montserrat_paragraph } from 'fonts'
import { Group, Select, Title, Text, ActionIcon, Tooltip } from '@mantine/core'
import Link from 'next/link'
import React from 'react'
import { type OpenAIModel } from '~/utils/modelProviders/types/openai'
import type ChatUI from '~/utils/modelProviders/WebLLM'
import { modelCached } from './UserSettings'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import {
  type AllLLMProviders,
  type AnySupportedModel,
  LLM_PROVIDER_ORDER,
  type LLMProvider,
  ProviderNames,
  selectBestModel,
} from '~/utils/modelProviders/LLMProvider'
import {
  recommendedModelIds,
  warningLargeModelIds,
} from '~/utils/modelProviders/ConfigWebLLM'
import {
  getCountryOfConcern,
  getCountryOfConcernShortMessage,
} from '~/utils/modelProviders/countriesOfConcern'
import { LoadingSpinner } from '../UIUC-Components/LoadingSpinner'

interface ModelDropdownProps {
  title: string
  value: string | undefined
  onChange: (value: string) => void
  llmProviders: AllLLMProviders
  isSmallScreen: boolean
  isWebLLM?: boolean
  loadingModelId: string | null
  chat_ui: ChatUI
}

const MODEL_DROPDOWN_MAX_CAP_PX = 480
const MODEL_DROPDOWN_PADDING_PX = 8
/** Roughly three model rows: below this the list is unusable, so let the modal scroll instead. */
const MODEL_DROPDOWN_MIN_PX = 160

/** Keep the model list inside the settings modal (or viewport fallback) so it can scroll instead of overflowing. */
export function getModelDropdownMaxHeight({
  triggerRect,
  containerRect,
  padding = MODEL_DROPDOWN_PADDING_PX,
  cap = MODEL_DROPDOWN_MAX_CAP_PX,
  floor = MODEL_DROPDOWN_MIN_PX,
}: {
  triggerRect: Pick<DOMRect, 'top' | 'bottom'>
  containerRect: Pick<DOMRect, 'top' | 'bottom'>
  padding?: number
  cap?: number
  floor?: number
}): number {
  const spaceBelow = containerRect.bottom - triggerRect.bottom - padding
  const spaceAbove = triggerRect.top - containerRect.top - padding
  const available = Math.max(spaceBelow, spaceAbove)
  // A container too short for `floor` gets `floor` anyway; the modal's own overflow clips it.
  return Math.min(cap, Math.max(Math.min(floor, cap), available))
}

/**
 * Mantine passes `maxDropdownHeight` through `rem()`, which divides by a hardcoded 16 —
 * so a raw pixel value renders as `px/16rem` and grows with the user's root font size.
 * Pre-scale it so the emitted rem resolves back to the pixel height we measured.
 */
export function toRemScaledDropdownHeight(
  pxHeight: number,
  rootFontSizePx: number,
): number {
  const rootFontSize = rootFontSizePx > 0 ? rootFontSizePx : 16
  return (pxHeight * 16) / rootFontSize
}

function getRootFontSizePx(): number {
  if (typeof window === 'undefined') return 16
  const parsed = Number.parseFloat(
    window.getComputedStyle(document.documentElement).fontSize,
  )
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 16
}

export function getModelDropdownBoundaryRect(
  triggerEl: HTMLElement,
): Pick<DOMRect, 'top' | 'bottom'> {
  const boundary =
    triggerEl.closest('[data-settings-modal-body]') ||
    triggerEl.closest('[data-settings-modal]') ||
    triggerEl.closest('.mantine-Modal-content') ||
    triggerEl.closest('[role="dialog"]')

  if (boundary instanceof HTMLElement) {
    return boundary.getBoundingClientRect()
  }

  return {
    top: 0,
    bottom:
      typeof window !== 'undefined'
        ? window.innerHeight
        : MODEL_DROPDOWN_MAX_CAP_PX,
  }
}

interface ModelItemProps extends React.ComponentPropsWithoutRef<'div'> {
  label: string
  downloadSize?: string
  isDownloaded?: boolean
  modelId: string
  selectedModelId: string | undefined
  modelType: string
  vram_required_MB: number
  chat_ui: ChatUI
}

export const getModelLogo = (modelType: string) => {
  switch (modelType) {
    case ProviderNames.OpenAI:
      return '/media/llm_icons/OpenAI.png'
    case ProviderNames.Ollama:
      return '/media/llm_icons/Ollama.png'
    case ProviderNames.WebLLM:
      return '/media/llm_icons/WebLLM.png'
    case ProviderNames.Anthropic:
      return '/media/llm_icons/Anthropic.png'
    case ProviderNames.NCSAHosted:
      return '/media/llm_icons/NCSAHosted.png'
    case ProviderNames.NCSAHostedVLM:
      return '/media/llm_icons/NCSAHosted.png'
    case ProviderNames.Azure:
      return '/media/llm_icons/Azure.png'
    case ProviderNames.Bedrock:
      return 'https://icon2.cleanpng.com/20190418/vhc/kisspng-amazon-web-services-logo-cloud-computing-amazon-co-logoaws-1-itnext-summit-1713897597915.webp'
    case ProviderNames.Gemini:
      return 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c1/Google_%22G%22_logo.svg/1200px-Google_%22G%22_logo.svg.png'
    case ProviderNames.SambaNova:
      return 'https://sambanova.ai/hubfs/logotype_sambanova_orange.png'
    case ProviderNames.OpenAICompatible:
      return '/media/llm_icons/OpenAI.png' // Reuse OpenAI icon for OpenAI-compatible models
    default:
      console.warn(`Unknown model type: ${modelType}`)
      return '/media/llm_icons/OpenAI.png'
  }
}
export const ModelItem = forwardRef<
  HTMLDivElement,
  ModelItemProps & {
    loadingModelId: string | null
    setLoadingModelId: (id: string | null) => void
  }
>(
  (
    {
      label,
      downloadSize,
      isDownloaded,
      modelId,
      selectedModelId,
      modelType,
      vram_required_MB,
      loadingModelId,
      setLoadingModelId,
      chat_ui,
      ...others
    }: ModelItemProps & {
      loadingModelId: string | null
      setLoadingModelId: (id: string | null) => void
    },
    ref,
  ) => {
    const [isModelCached, setIsModelCached] = useState(false)
    const showSparkles = recommendedModelIds.includes(label)
    const showWarningLargeModel = warningLargeModelIds.includes(label)
    const countryOfConcern = getCountryOfConcern(modelId)
    const { state, dispatch: homeDispatch } = useContext(HomeContext)
    // const {
    //   state: {
    //     isLoadingWebLLMModelId,

    //   },
    //   handleUpdateConversation,
    //   dispatch: homeDispatch,
    // } = useContext(HomeContext)
    useEffect(() => {
      const checkModelCache = async () => {
        // if (!chat_ui?.isModelLoading()) {
        //   setLoadingModelId(null)
        // }

        const cached = modelCached.some((model) => model.id === modelId)
        setIsModelCached(cached)
        // if (cached && isLoading) {
        //   const webLLMLoadingState = { id: modelId, isLoading: false }
        //   // homeDispatch({
        //   //   field: 'webLLMModelIdLoading',
        //   //   value: WebLLMLoadingState,
        //   // })
        //   setLoadingModelId(null)
        // }
        //   console.log('model is loading', state.webLLMModelIdLoading)
        //   if (state.webLLMModelIdLoading.isLoading) {
        //     setLoadingModelId(modelId)
        //     console.log('model id', modelId)
        //     console.log('loading model id', loadingModelId)
        //     console.log('model is loading', state.webLLMModelIdLoading.id)
        //   } else if (!state.webLLMModelIdLoading.isLoading) {
        //     setLoadingModelId(null)
        //   }
        // }
      }
      checkModelCache()
    }, [modelId])

    return (
      <div ref={ref} {...others}>
        <Group noWrap>
          <div>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <Image
                aria-hidden="true"
                src={getModelLogo(modelType)}
                alt={`${modelType} logo`}
                width={20}
                height={20}
                style={{ marginRight: '8px', borderRadius: '4px' }}
              />
              {/* {selectedModelId === modelId ? (
                <IconCircleCheck stroke={2} />
              ) : (
                <IconCircleDashed stroke={2} />
              )} */}
              <Text size="sm" style={{ marginLeft: '8px' }}>
                {label}
              </Text>
              {countryOfConcern && (
                <Tooltip
                  multiline
                  width={280}
                  withArrow
                  withinPortal
                  label={getCountryOfConcernShortMessage(countryOfConcern)}
                >
                  <span
                    aria-label={`Country of concern warning: ${countryOfConcern}`}
                    style={{
                      marginLeft: '6px',
                      display: 'inline-flex',
                      alignItems: 'center',
                    }}
                  >
                    <IconAlertTriangle
                      size="0.9rem"
                      aria-hidden="true"
                      className="text-yellow-500"
                    />
                  </span>
                </Tooltip>
              )}
            </div>
            {downloadSize && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  marginTop: '4px',
                  paddingLeft: '36px', //line up with image and text better. needs to be a different layout in the future
                }}
              >
                <Text size="xs" opacity={0.65}>
                  {downloadSize}
                </Text>
                {state.webLLMModelIdLoading.id == modelId &&
                state.webLLMModelIdLoading.isLoading ? (
                  <div
                    style={{
                      marginLeft: '8px',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <LoadingSpinner size="0.5rem" />
                    <Text
                      size="s"
                      style={{ marginLeft: '7px' }}
                      className="text-[--accent]"
                    >
                      loading
                    </Text>
                  </div>
                ) : (
                  <>
                    {isModelCached ||
                    (state.webLLMModelIdLoading.id == modelId &&
                      !state.webLLMModelIdLoading.isLoading) ? (
                      <>
                        <IconCircleCheck
                          size="1rem"
                          aria-hidden="true"
                          style={{ marginLeft: '8px' }}
                          className=""
                        />
                        {/* {isLoading && setLoadingModelId(null)} */}
                      </>
                    ) : (
                      <IconDownload
                        size="1rem"
                        aria-hidden="true"
                        style={{ marginLeft: '8px' }}
                      />
                    )}
                    <Text
                      size="xs"
                      opacity={isModelCached ? 1 : 0.65}
                      className={
                        isModelCached ||
                        (state.webLLMModelIdLoading.id == modelId &&
                          !state.webLLMModelIdLoading.isLoading)
                          ? 'ml-[3px] italic'
                          : 'ml-1'
                      }
                    >
                      {isModelCached ||
                      (state.webLLMModelIdLoading.id == modelId &&
                        !state.webLLMModelIdLoading.isLoading)
                        ? 'downloaded'
                        : 'download'}
                    </Text>
                  </>
                )}
                {showSparkles && (
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <IconSparkles
                      size="1rem"
                      aria-hidden="true"
                      style={{ marginLeft: '8px' }}
                    />
                    <Text
                      size="xs"
                      opacity={0.65}
                      style={{ marginLeft: '4px' }}
                    >
                      recommended
                    </Text>
                  </div>
                )}
                {showWarningLargeModel && (
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <IconAlertTriangle
                      size="1rem"
                      aria-hidden="true"
                      style={{ marginLeft: '8px' }}
                    />
                    <Text
                      size="xs"
                      opacity={0.65}
                      style={{ marginLeft: '4px' }}
                    >
                      warning, requires large vRAM GPU
                    </Text>
                  </div>
                )}
              </div>
            )}
          </div>
        </Group>
      </div>
    )
  },
)

const ModelDropdown: React.FC<
  ModelDropdownProps & {
    setLoadingModelId: (id: string | null) => void
    onChange: (modelId: string) => Promise<void>
  }
> = ({
  title,
  value,
  onChange,
  llmProviders,
  isSmallScreen,
  isWebLLM,
  loadingModelId,
  setLoadingModelId,
  chat_ui,
}) => {
  const { state } = useContext(HomeContext)
  const { height: viewportHeight } = useViewportSize()
  const selectInputRef = useRef<HTMLInputElement>(null)
  const [dropdownOpened, setDropdownOpened] = useState(false)
  const [maxDropdownHeight, setMaxDropdownHeight] = useState(
    MODEL_DROPDOWN_MAX_CAP_PX,
  )

  const constrainDropdownHeight = useCallback(() => {
    const triggerEl = selectInputRef.current
    const measuredViewportHeight =
      viewportHeight ||
      (typeof window !== 'undefined'
        ? window.innerHeight
        : MODEL_DROPDOWN_MAX_CAP_PX)

    const availablePx = triggerEl
      ? getModelDropdownMaxHeight({
          triggerRect: triggerEl.getBoundingClientRect(),
          containerRect: getModelDropdownBoundaryRect(triggerEl),
        })
      : Math.min(
          MODEL_DROPDOWN_MAX_CAP_PX,
          Math.max(MODEL_DROPDOWN_MIN_PX, measuredViewportHeight - 200),
        )

    setMaxDropdownHeight(
      toRemScaledDropdownHeight(availablePx, getRootFontSizePx()),
    )
  }, [viewportHeight])

  useEffect(() => {
    if (dropdownOpened) {
      constrainDropdownHeight()
    }
  }, [constrainDropdownHeight, dropdownOpened])

  // The modal body is its own scroll container, so scrolling it moves the (non-portalled)
  // dropdown without changing the viewport size. Re-measure instead of keeping a stale height.
  useEffect(() => {
    if (!dropdownOpened || typeof window === 'undefined') return

    let frame: number | null = null
    const handleReposition = () => {
      if (frame !== null) return
      frame = window.requestAnimationFrame(() => {
        frame = null
        constrainDropdownHeight()
      })
    }

    // Capture phase so inner scroll containers, not just the window, are observed.
    window.addEventListener('scroll', handleReposition, true)
    window.addEventListener('resize', handleReposition)

    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame)
      window.removeEventListener('scroll', handleReposition, true)
      window.removeEventListener('resize', handleReposition)
    }
  }, [constrainDropdownHeight, dropdownOpened])

  // Filter out providers that are not enabled and their models which are disabled
  const { enabledProvidersAndModels, allModels } = Object.keys(
    llmProviders,
  ).reduce(
    (
      acc: {
        enabledProvidersAndModels: Record<string, LLMProvider>
        allModels: AnySupportedModel[]
      },
      key,
    ) => {
      const provider = llmProviders[key as keyof typeof llmProviders]
      if (provider && provider.enabled) {
        const enabledModels =
          provider.models?.filter(
            (model: AnySupportedModel) => model.enabled,
          ) || []
        if (enabledModels.length > 0) {
          // @ts-ignore -- Can't figure out why the types aren't perfect.
          acc.enabledProvidersAndModels[key as keyof typeof llmProviders] = {
            ...provider,
            models: enabledModels,
          }
          acc.allModels.push(
            ...enabledModels.map((model: AnySupportedModel) => ({
              ...model,
              provider: provider.provider,
            })),
          )
        }
      }
      return acc
    },
    {
      enabledProvidersAndModels: {} as Record<string, LLMProvider>,
      allModels: [] as AnySupportedModel[],
    },
  )

  const selectedModel = allModels.find((model) => model.id === value)
  const selectedModelCountry = getCountryOfConcern(value)

  return (
    <>
      <Title
        className={`px-4 pt-4 ${montserrat_heading.variable} rounded-lg bg-[--modal-dark] p-4 font-montserratHeading text-[--modal-text] md:rounded-lg`}
        color="white"
        order={isSmallScreen ? 5 : 4}
      >
        Model
      </Title>

      <div
        tabIndex={0}
        className="relative mt-4 flex w-full flex-col items-start overflow-visible px-4"
      >
        <Select
          ref={selectInputRef}
          className="menu w-full"
          size="md"
          placeholder="Select a model"
          aria-label="Select a model"
          searchable
          value={value}
          onDropdownOpen={() => {
            setDropdownOpened(true)
            constrainDropdownHeight()
          }}
          onDropdownClose={() => setDropdownOpened(false)}
          onChange={async (modelId) => {
            if (state.webLLMModelIdLoading.isLoading) {
              setLoadingModelId(modelId)
              // console.log('model id', modelId)
              // console.log('loading model id', loadingModelId)
              // console.log('model is loading', state.webLLMModelIdLoading.id)
            } else if (!state.webLLMModelIdLoading.isLoading) {
              setLoadingModelId(null)
            }
            await onChange(modelId!)
          }}
          data={Object.entries(enabledProvidersAndModels)
            // Sort by LLM_PROVIDER_ORDER
            .sort(([providerA], [providerB]) => {
              const indexA = LLM_PROVIDER_ORDER.indexOf(
                providerA as ProviderNames,
              )
              const indexB = LLM_PROVIDER_ORDER.indexOf(
                providerB as ProviderNames,
              )
              // Providers not in the order list will be placed at the end
              if (indexA === -1) return 1
              if (indexB === -1) return -1
              return indexA - indexB
            })
            .flatMap(
              ([_, provider]) =>
                provider.models?.map((model: AnySupportedModel) => ({
                  value: model.id,
                  label: model.name,
                  // @ts-ignore -- this being missing is fine
                  downloadSize: model?.downloadSize,
                  modelId: model.id,
                  selectedModelId: value,
                  modelType: provider.provider,
                  group: provider.provider,
                  // @ts-ignore -- this being missing is fine
                  vram_required_MB: model.vram_required_MB,
                })) || [],
            )}
          itemComponent={(props) => (
            <ModelItem
              {...props}
              loadingModelId={loadingModelId}
              setLoadingModelId={setLoadingModelId}
            />
          )}
          maxDropdownHeight={maxDropdownHeight}
          zIndex={400}
          positionDependencies={[maxDropdownHeight]}
          rightSectionWidth="auto"
          icon={
            selectedModel ? (
              <Image
                // @ts-ignore -- this being missing is fine
                src={getModelLogo(selectedModel.provider)}
                // @ts-ignore -- this being missing is fine
                alt={`${selectedModel.provider} logo`}
                width={20}
                height={20}
                style={{ marginLeft: '4px', borderRadius: '4px' }}
              />
            ) : null
          }
          rightSection={
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              {selectedModelCountry && (
                <Tooltip
                  multiline
                  width={280}
                  withArrow
                  withinPortal
                  label={getCountryOfConcernShortMessage(selectedModelCountry)}
                >
                  <span
                    aria-label={`Country of concern warning: ${selectedModelCountry}`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      pointerEvents: 'auto',
                    }}
                  >
                    <IconAlertTriangle
                      size="1rem"
                      aria-hidden="true"
                      className="text-yellow-500"
                    />
                  </span>
                </Tooltip>
              )}
              <IconChevronDown
                size="1rem"
                aria-hidden="true"
                className="mr-2 text-[--modal-button-text]"
              />
            </div>
          }
          classNames={{
            root: 'w-full',
            wrapper: 'w-full',
            input: `${montserrat_paragraph.variable} font-montserratParagraph ${
              isSmallScreen ? 'text-xs' : 'text-sm'
            } w-full`,
            rightSection: 'pointer-events-none',
            item: `${montserrat_paragraph.variable} font-montserratParagraph ${
              isSmallScreen ? 'text-xs' : 'text-sm'
            }`,
          }}
          styles={(theme) => ({
            input: {
              cursor: 'pointer',
              color: 'var(--modal-button-text)',
              backgroundColor: 'var(--modal-button)',
              border: 'none',
              // color: theme.white,
              // borderRadius: theme.radius.md,
              // width: '24rem',
              // [`@media (max-width: 960px)`]: {
              //   width: '17rem', // Smaller width for small screens
              // },
              '&:hover': {
                color: 'var(--modal-button-text-hover)',
                backgroundColor: 'var(--modal-button-hover)',
              },
            },
            dropdown: {
              color: 'var(--background)',
              backgroundColor: 'var(--foreground-light)',
              border: '0px',
              borderRadius: theme.radius.md,
              marginTop: '2px',
              boxShadow: theme.shadows.lg,
              width: '100%',
              maxWidth: '100%',
              overflowY: 'auto',
              zIndex: 400,
            },
            item: {
              color: 'var(--modal-button-text)',
              backgroundColor: '',
              borderRadius: theme.radius.md,
              margin: '2px',
              '&[data-selected]': {
                '&': {
                  color: 'var(--primary)',
                  backgroundColor: 'transparent',
                },
                '&:hover': {
                  color: 'var(--modal-button-text-hover)',
                  backgroundColor: 'var(--modal-button-hover)',
                },
              },
              '&[data-hovered]': {
                color: 'var(--modal-button-text-hover)',
                backgroundColor: 'var(--modal-button-hover)',
              },
            },
          })}
          dropdownPosition="flip"
          withinPortal={false}
        />
      </div>
    </>
  )
}

export const ModelSelect = React.forwardRef<HTMLDivElement, any>(
  ({ chat_ui, props }, ref) => {
    const {
      state: { selectedConversation, llmProviders, defaultModelId },
      handleUpdateConversation,
      dispatch: homeDispatch,
    } = useContext(HomeContext)
    const isSmallScreen = useMediaQuery('(max-width: 960px)')
    const defaultModel = selectBestModel(llmProviders).id
    const [loadingModelId, setLoadingModelId] = useState<string | null>(null)
    const [isAccordionOpen, setIsAccordionOpen] = useState(true)

    // console.log('defaultModelId in chat page: ', defaultModelId)

    const handleModelClick = (modelId: string) => {
      // Get list of models from all providers
      const allModels = Object.values(llmProviders)
        .flatMap((provider) => provider?.models || [])
        .filter((model) => model.enabled)

      const model =
        Object.keys(allModels).reduce((foundModel: any, key: any) => {
          return foundModel || allModels!.find((model) => model.id === modelId)
        }, undefined) || defaultModel

      selectedConversation &&
        handleUpdateConversation(selectedConversation, {
          key: 'model',
          value: model as OpenAIModel,
        })
      localStorage.setItem('defaultModel', modelId)
    }

    return (
      <div
        className="flex h-full w-[100%] flex-col space-y-4 rounded-lg p-3"
        style={{ position: 'relative', zIndex: 100 }}
      >
        <div>
          <div className="flex flex-col">
            <ModelDropdown
              title="Select Model"
              value={selectedConversation?.model.id || defaultModelId}
              onChange={async (modelId) => {
                handleModelClick(modelId)
              }}
              llmProviders={llmProviders}
              isSmallScreen={isSmallScreen}
              loadingModelId={loadingModelId}
              setLoadingModelId={setLoadingModelId}
              chat_ui={chat_ui}
            />
            <div className="px-5">
              <button
                onClick={() => setIsAccordionOpen(!isAccordionOpen)}
                className="w-full opacity-60 transition-colors duration-200 hover:opacity-100"
              >
                <div className="flex items-center justify-between rounded-md p-2">
                  <Title className={`pb-1 pl-3 text-sm`} order={5}>
                    More details about the AI models
                  </Title>
                  <IconChevronDown
                    size={'1em'}
                    aria-hidden="true"
                    className={`transition-transform duration-200 ${
                      isAccordionOpen ? 'rotate-180' : ''
                    }`}
                  />
                </div>
              </button>
              <AnimatePresence>
                {isAccordionOpen && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2, ease: 'easeInOut' }}
                    className="mb-6 overflow-hidden"
                  >
                    <div className="flex">
                      <div className="w-1" />
                      <div
                        className={`${montserrat_paragraph.variable} flex-1 p-4 font-montserratParagraph`}
                      >
                        <div className="space-y-6">
                          {/* Countries of Concern Section */}
                          <div>
                            <Text
                              size={'sm'}
                              className={`${montserrat_heading.variable} mb-2 font-montserratHeading font-semibold`}
                            >
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                }}
                              >
                                <IconAlertTriangle
                                  size="1rem"
                                  aria-hidden="true"
                                  className="text-yellow-500"
                                />
                                Countries of Concern
                              </span>
                            </Text>
                            <Text
                              size={'sm'}
                              className={`${montserrat_paragraph.variable} font-montserratParagraph`}
                            >
                              Models marked with a yellow warning icon originate
                              from countries the U.S. Department of Commerce has
                              flagged as countries of concern (currently China,
                              Russia, Iran, and North Korea). These models may
                              carry data-handling, supply-chain, or compliance
                              risks. They are disabled by default; admins can
                              still enable them after reviewing the warning.
                            </Text>
                          </div>

                          {/* NCSA VLM Section */}
                          <div>
                            <Text
                              size={'sm'}
                              className={`${montserrat_heading.variable} mb-2 font-montserratHeading font-semibold`}
                            >
                              NCSA Hosted Models (100% free)
                            </Text>
                            <Text
                              size={'sm'}
                              className={`${montserrat_paragraph.variable} font-montserratParagraph`}
                            >
                              The best free option is the Qwen 2 72B model,
                              hosted by NCSA.
                            </Text>
                          </div>

                          {/* OpenAI Section */}
                          <div>
                            <Text
                              size={'sm'}
                              className={`${montserrat_heading.variable} mb-2 font-montserratHeading font-semibold`}
                            >
                              OpenAI
                            </Text>
                            <Text
                              size={'sm'}
                              className={`${montserrat_paragraph.variable} font-montserratParagraph`}
                            >
                              OpenAI{' '}
                              <Link
                                href="https://platform.openai.com/docs/models"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[--link] hover:text-[--link-hover] hover:underline"
                              >
                                model details and pricing.{' '}
                                <IconExternalLink
                                  size={15}
                                  aria-hidden="true"
                                  style={{ position: 'relative', top: '2px' }}
                                  className={'mb-2 inline'}
                                />
                              </Link>{' '}
                              An OpenAI API key is required, and you may face
                              rate-limit issues until you complete your first
                              billing cycle.
                            </Text>
                          </div>

                          {/* Azure OpenAI Section */}
                          <div>
                            <Text
                              size={'sm'}
                              className={`${montserrat_heading.variable} mb-2 font-montserratHeading font-semibold`}
                            >
                              Azure OpenAI
                            </Text>
                            <Text
                              size={'sm'}
                              className={`${montserrat_paragraph.variable} font-montserratParagraph`}
                            >
                              Azure OpenAI Service provides enterprise-grade
                              security and regional availability. Check out{' '}
                              <Link
                                href="https://learn.microsoft.com/en-us/azure/ai-services/openai/concepts/models"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[--link] hover:text-[--link-hover] hover:underline"
                              >
                                Azure OpenAI models{' '}
                                <IconExternalLink
                                  size={15}
                                  aria-hidden="true"
                                  style={{ position: 'relative', top: '2px' }}
                                  className={'mb-2 inline'}
                                />
                              </Link>{' '}
                              for details on available models and features.
                            </Text>
                          </div>

                          {/* Anthropic Section */}
                          <div>
                            <Text
                              size={'sm'}
                              className={`${montserrat_heading.variable} mb-2 font-montserratHeading font-semibold`}
                            >
                              Anthropic
                            </Text>
                            <Text
                              size={'sm'}
                              className={`${montserrat_paragraph.variable} font-montserratParagraph`}
                            >
                              Access Claude models through{' '}
                              <Link
                                href="https://www.anthropic.com/api"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[--link] hover:text-[--link-hover] hover:underline"
                              >
                                Anthropic&apos;s API{' '}
                                <IconExternalLink
                                  size={15}
                                  aria-hidden="true"
                                  style={{ position: 'relative', top: '2px' }}
                                  className={'mb-2 inline'}
                                />
                              </Link>
                              . Claude excels at complex reasoning and analysis
                              tasks.
                            </Text>
                          </div>

                          {/* Ollama Section */}
                          <div>
                            <Text
                              size={'sm'}
                              className={`${montserrat_heading.variable} mb-2 font-montserratHeading font-semibold`}
                            >
                              OpenAI Compatible via Ollama
                            </Text>
                            <Text
                              size={'sm'}
                              className={`${montserrat_paragraph.variable} font-montserratParagraph`}
                            >
                              Run various open-source models locally through{' '}
                              <Link
                                href="https://ollama.ai"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[--link] hover:text-[--link-hover] hover:underline"
                              >
                                Ollama{' '}
                                <IconExternalLink
                                  size={15}
                                  aria-hidden="true"
                                  style={{ position: 'relative', top: '2px' }}
                                  className={'mb-2 inline'}
                                />
                              </Link>
                              . Supports models like Llama 2, Mistral, and more
                              with OpenAI-compatible API.
                            </Text>
                          </div>

                          {/* On-device LLMs Section */}
                          <div>
                            <Text
                              size={'sm'}
                              className={`${montserrat_heading.variable} mb-2 font-montserratHeading font-semibold`}
                            >
                              On-device AI with WebLLM
                            </Text>
                            <Text
                              size={'sm'}
                              className={`${montserrat_paragraph.variable} font-montserratParagraph`}
                            >
                              We support running some models in your web browser
                              on your device. That&apos;s 100% local, on-device
                              AI. It even uses your GPU. For this, your browser{' '}
                              <Link
                                href={'https://webgpureport.org/'}
                                className="text-[--link] hover:text-[--link-hover] hover:underline"
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                must pass this compatability check for WebGPU.{' '}
                                <IconExternalLink
                                  size={15}
                                  aria-hidden="true"
                                  style={{ position: 'relative', top: '2px' }}
                                  className={'mb-2 inline'}
                                />
                              </Link>
                              <br />
                              If you see lots of text, it&apos;s working. If you
                              see &quot;webgpu not available on this
                              browser&quot;, it&apos;s not working.
                            </Text>
                          </div>

                          {/* Coming Soon Section */}
                          <div>
                            <Text
                              size={'sm'}
                              className={`${montserrat_heading.variable} mb-2 font-montserratHeading font-semibold`}
                            >
                              Google Gemini
                            </Text>
                            <Text
                              size={'sm'}
                              className={`${montserrat_paragraph.variable} font-montserratParagraph`}
                            >
                              We support{' '}
                              <Link
                                href="https://ai.google.dev/gemini-api/docs/models/gemini"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[--link] hover:text-[--link-hover] hover:underline"
                              >
                                Gemini&apos;s full suite{' '}
                                <IconExternalLink
                                  size={15}
                                  aria-hidden="true"
                                  style={{ position: 'relative', top: '2px' }}
                                  className={'mb-2 inline'}
                                />
                              </Link>
                              .
                            </Text>
                          </div>
                          <div>
                            <Text
                              size={'sm'}
                              className={`${montserrat_heading.variable} mb-2 font-montserratHeading font-semibold`}
                            >
                              AWS Bedrock
                            </Text>
                            <Text
                              size={'sm'}
                              className={`${montserrat_paragraph.variable} font-montserratParagraph`}
                            >
                              We support{' '}
                              <Link
                                href="https://docs.aws.amazon.com/bedrock/latest/userguide/models-supported.html"
                                className="text-[--link] hover:text-[--link-hover] hover:underline"
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                Bedrock&apos;s full suite{' '}
                                <IconExternalLink
                                  size={15}
                                  aria-hidden="true"
                                  style={{ position: 'relative', top: '2px' }}
                                  className={'mb-2 inline'}
                                />
                              </Link>
                              .
                            </Text>
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    )
  },
)

ModelItem.displayName = 'ModelItem'
ModelSelect.displayName = 'ModelSelect'
