import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FileMenu } from './FileMenu'

describe('FileMenu', () => {
  it('renders menu actions and calls the provided callbacks', () => {
    const onToggle = vi.fn()
    const onNewFile = vi.fn()
    const onOpenFile = vi.fn()
    const onSaveFile = vi.fn()
    const onExport = vi.fn()

    render(
      <FileMenu
        fileMenuRef={null}
        isOpen
        isOpeningFile={false}
        isExporting={false}
        theme="light"
        onToggle={onToggle}
        onToggleTheme={vi.fn()}
        onNewFile={onNewFile}
        onOpenFile={onOpenFile}
        onSaveFile={onSaveFile}
        onExport={onExport}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'File' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'New File' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Open File' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Save File' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Export PNG' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Export JPEG' }))

    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(onNewFile).toHaveBeenCalledTimes(1)
    expect(onOpenFile).toHaveBeenCalledTimes(1)
    expect(onSaveFile).toHaveBeenCalledTimes(1)
    expect(onExport).toHaveBeenNthCalledWith(1, 'png')
    expect(onExport).toHaveBeenNthCalledWith(2, 'jpeg')
  })
})
