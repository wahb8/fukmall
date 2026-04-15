import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AddLayerPanel } from './AddLayerPanel'

function createProps(overrides = {}) {
  return {
    jsonInput: '',
    status: { message: '', tone: 'info' },
    selectedLayerType: 'text',
    textFormValues: {
      text: 'New Text',
      color: '#0f172a',
      bolded: false,
      font: 'Arial, sans-serif',
      size: '42',
      alignment: 'left',
      x: '80',
      y: '80',
      width: '280',
      height: '96',
      addShadow: false,
      layerPlacement: '',
    },
    imageFormValues: {
      src: '',
      x: '80',
      y: '80',
      width: '300',
      height: '220',
      opacity: '1',
      rotation: '0',
      scaleX: '1',
      scaleY: '1',
      layerPlacement: '',
    },
    fontFamilyOptions: [
      { label: 'Arial', value: 'Arial, sans-serif' },
      { label: 'Rubik', value: '"Rubik", sans-serif' },
    ],
    onJsonInputChange: vi.fn(),
    onApplyJson: vi.fn(),
    onCreateFromJson: vi.fn(),
    onSelectedLayerTypeChange: vi.fn(),
    onTextFormChange: vi.fn(),
    onImageFormChange: vi.fn(),
    onCreateLayer: vi.fn(),
    ...overrides,
  }
}

describe('AddLayerPanel', () => {
  it('renders text controls and dispatches the basic callbacks', () => {
    const props = createProps()

    render(<AddLayerPanel {...props} />)

    fireEvent.change(screen.getByLabelText('JSON'), { target: { value: '{"texts":[]}' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply JSON' }))
    fireEvent.click(screen.getByRole('button', { name: 'Create From JSON' }))
    fireEvent.change(screen.getByLabelText('Text Content'), { target: { value: 'Poster' } })
    fireEvent.change(screen.getByLabelText('Width'), { target: { value: '320' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create Layer' }))

    expect(props.onJsonInputChange).toHaveBeenCalledWith('{"texts":[]}')
    expect(props.onApplyJson).toHaveBeenCalledTimes(1)
    expect(props.onCreateFromJson).toHaveBeenCalledTimes(1)
    expect(props.onTextFormChange).toHaveBeenCalledWith('text', 'Poster')
    expect(props.onTextFormChange).toHaveBeenCalledWith('width', '320')
    expect(props.onCreateLayer).toHaveBeenCalledTimes(1)
  })

  it('renders image controls and inline status when image mode is active', () => {
    const props = createProps({
      selectedLayerType: 'image',
      status: { message: 'Image source could not be loaded.', tone: 'error' },
    })

    render(<AddLayerPanel {...props} />)

    expect(screen.getByRole('alert')).toHaveTextContent('Image source could not be loaded.')

    fireEvent.change(screen.getByLabelText('Image Source'), {
      target: { value: 'https://example.com/image.png' },
    })
    fireEvent.change(screen.getAllByLabelText('Layer Type').at(-1), { target: { value: 'text' } })

    expect(props.onImageFormChange).toHaveBeenCalledWith('src', 'https://example.com/image.png')
    expect(props.onSelectedLayerTypeChange).toHaveBeenCalledWith('text')
  })
})
