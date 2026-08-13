import React from 'react'
import { Button, Group, Modal, Text } from '@mantine/core'
import { IconAlertTriangleFilled } from '@tabler/icons-react'
import { montserrat_heading, montserrat_paragraph } from 'fonts'

interface CountryOfConcernModalProps {
  opened: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  confirmLabel: string
  children: React.ReactNode
}

/**
 * Confirmation modal shown before an admin enables a country-of-concern model
 * or sets one as the chatbot default.
 *
 * Both flows previously rendered an unstyled Mantine modal with Tailwind
 * yellow and default system fonts, which did not match the design system.
 * Styling lives here so the two entry points cannot drift: modal chrome uses
 * the --modal* tokens (as in LinkGeneratorModal), copy uses Montserrat, the
 * warning icon uses --illinois-orange, and the confirm button uses the
 * --dashboard-button pair.
 */
export function CountryOfConcernModal({
  opened,
  onClose,
  onConfirm,
  title,
  confirmLabel,
  children,
}: CountryOfConcernModalProps) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      centered
      radius="md"
      zIndex={1000}
      title={
        <Text
          size="lg"
          weight={700}
          className={`${montserrat_heading.variable} font-montserratHeading`}
        >
          {title}
        </Text>
      }
      styles={{
        header: {
          color: 'var(--modal-text)',
          backgroundColor: 'var(--modal)',
          borderBottom: '1px solid var(--modal-border)',
          padding: '20px 24px',
          marginBottom: '16px',
        },
        content: {
          color: 'var(--modal-text)',
          backgroundColor: 'var(--modal)',
          border: '1px solid var(--modal-border)',
        },
        body: {
          padding: '0 24px 24px 24px',
        },
        title: {
          marginBottom: 0,
        },
        close: {
          color: 'var(--foreground-faded)',
          marginTop: '4px',
        },
      }}
    >
      <Group spacing="sm" align="flex-start" noWrap>
        <IconAlertTriangleFilled
          size="1.5rem"
          style={{
            marginTop: 2,
            flexShrink: 0,
            color: 'var(--illinois-orange)',
          }}
          aria-hidden="true"
        />
        <Text
          size="sm"
          className={`${montserrat_paragraph.variable} font-montserratParagraph`}
          style={{ lineHeight: 1.5, color: 'var(--modal-text)' }}
        >
          {children}
        </Text>
      </Group>

      <Group position="right" mt="lg" spacing="sm">
        <Button
          variant="outline"
          radius="md"
          onClick={onClose}
          className={`${montserrat_paragraph.variable} font-montserratParagraph`}
          sx={{
            borderColor: 'var(--modal-border)',
            color: 'var(--modal-text)',
            fontWeight: 600,
            '&:hover': {
              backgroundColor: 'var(--background-faded)',
            },
          }}
        >
          Cancel
        </Button>
        <Button
          variant="filled"
          radius="md"
          onClick={onConfirm}
          className={`${montserrat_paragraph.variable} font-montserratParagraph`}
          sx={{
            background: 'var(--dashboard-button) !important',
            border: 'none',
            color: 'var(--dashboard-button-foreground)',
            fontWeight: 600,
            transition: 'all 0.2s ease',
            '&:hover': {
              background: 'var(--dashboard-button-hover) !important',
            },
          }}
        >
          {confirmLabel}
        </Button>
      </Group>
    </Modal>
  )
}
