import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CanvasDownloadPanel } from './CanvasDownloadPanel'

describe('CanvasDownloadPanel', () => {
  afterEach(() => {
    cleanup()
  })

  it('offers PNG and JPG downloads and calls the shared export handler', () => {
    const onDownload = vi.fn()

    render(<CanvasDownloadPanel onDownload={onDownload} />)

    expect(screen.getByRole('complementary', { name: 'Canvas download tools' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Draft' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Alt' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Notes' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Post' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'PNG' }))
    fireEvent.click(screen.getByRole('button', { name: 'JPG' }))

    expect(onDownload).toHaveBeenNthCalledWith(1, 'png')
    expect(onDownload).toHaveBeenNthCalledWith(2, 'jpeg')
  })

  it('disables download buttons while an export is running', () => {
    render(<CanvasDownloadPanel isDownloading onDownload={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'PNG' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'JPG' })).toBeDisabled()
  })
})
