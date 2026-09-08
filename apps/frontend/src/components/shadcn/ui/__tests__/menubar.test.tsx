import React from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import {
  Menubar,
  MenubarCheckboxItem,
  MenubarContent,
  MenubarGroup,
  MenubarItem,
  MenubarLabel,
  MenubarMenu,
  MenubarPortal,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger,
} from '../menubar'

describe('shadcn menubar', () => {
  it('renders and opens menus, including checkbox/radio/sub items', async () => {
    const user = userEvent.setup()

    render(
      <Menubar>
        <MenubarMenu>
          <MenubarTrigger>File</MenubarTrigger>
          <MenubarPortal>
            <MenubarContent>
              <MenubarGroup>
                <MenubarLabel inset>Options</MenubarLabel>
              </MenubarGroup>
              <MenubarSeparator />
              <MenubarGroup>
                <MenubarItem inset>
                  New <MenubarShortcut>⌘N</MenubarShortcut>
                </MenubarItem>
                <MenubarCheckboxItem checked>Checked</MenubarCheckboxItem>
                <MenubarRadioGroup value="a">
                  <MenubarRadioItem value="a">A</MenubarRadioItem>
                  <MenubarRadioItem value="b">B</MenubarRadioItem>
                </MenubarRadioGroup>
                <MenubarSub>
                  <MenubarSubTrigger inset>More</MenubarSubTrigger>
                  <MenubarSubContent>
                    <MenubarItem>Sub item</MenubarItem>
                  </MenubarSubContent>
                </MenubarSub>
              </MenubarGroup>
            </MenubarContent>
          </MenubarPortal>
        </MenubarMenu>
      </Menubar>,
    )

    await user.click(screen.getByText('File'))
    expect(await screen.findByText('Options')).toBeInTheDocument()

    await user.click(screen.getByText('More'))
    expect(await screen.findByText('Sub item')).toBeInTheDocument()
  })
})
