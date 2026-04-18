import { StrictMode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import App from './App'

const JSON_TEXT_PAYLOAD = `{
  "texts": [
    {
      "Layer name": "JSON Hero Title",
      "text": "Hello world",
      "color": "#123456",
      "bolded": true,
      "font": "Arial, sans-serif",
      "size": 72,
      "alignment": "center",
      "x": 400,
      "y": 1000,
      "width": 500,
      "height": 200,
      "addShadow": false,
      "layerPlacement": 0
    }
  ]
}`

describe('App Add Layer JSON flow', () => {
  afterEach(() => {
    cleanup()
  })

  it('preserves the final runtime text layer width and height from JSON', async () => {
    const { container } = render(
      <StrictMode>
        <App />
      </StrictMode>,
    )

    fireEvent.change(screen.getAllByLabelText('JSON')[0], {
      target: { value: JSON_TEXT_PAYLOAD },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create From JSON' }))

    const inspectorPanel = container.querySelector('.inspector-panel')

    expect(inspectorPanel).not.toBeNull()

    await waitFor(() => {
      expect(within(inspectorPanel).getByLabelText('Width')).toHaveValue(500)
      expect(within(inspectorPanel).getByLabelText('Height')).toHaveValue(200)
    })
    expect(screen.getByDisplayValue('JSON Hero Title')).toBeInTheDocument()
  })

  it('preserves the final runtime text layer width and height after Apply JSON then Create Layer', async () => {
    const { container } = render(
      <StrictMode>
        <App />
      </StrictMode>,
    )

    fireEvent.change(screen.getAllByLabelText('JSON')[0], {
      target: { value: JSON_TEXT_PAYLOAD },
    })
    fireEvent.click(screen.getAllByRole('button', { name: 'Apply JSON' })[0])
    fireEvent.click(screen.getAllByRole('button', { name: 'Create Layer' })[0])

    const inspectorPanel = container.querySelector('.inspector-panel')

    expect(inspectorPanel).not.toBeNull()

    await waitFor(() => {
      expect(within(inspectorPanel).getByLabelText('Width')).toHaveValue(500)
      expect(within(inspectorPanel).getByLabelText('Height')).toHaveValue(200)
    })
    expect(screen.getByDisplayValue('JSON Hero Title')).toBeInTheDocument()
  })

  it('does not clear selection when clicking inside the inspector panel body', async () => {
    const { container } = render(
      <StrictMode>
        <App />
      </StrictMode>,
    )

    fireEvent.change(screen.getAllByLabelText('JSON')[0], {
      target: { value: JSON_TEXT_PAYLOAD },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create From JSON' }))

    const inspectorPanel = container.querySelector('.inspector-panel')
    const inspectorBody = container.querySelector('.inspector-panel-body')

    expect(inspectorPanel).not.toBeNull()
    expect(inspectorBody).not.toBeNull()

    await waitFor(() => {
      expect(within(inspectorPanel).getByLabelText('Width')).toHaveValue(500)
    })

    fireEvent.pointerDown(inspectorBody, { clientX: 10, clientY: 10 })

    expect(within(inspectorPanel).getByLabelText('Width')).toHaveValue(500)
    expect(within(inspectorPanel).getByLabelText('Height')).toHaveValue(200)
  })

  it('does not clear selection when interacting with an inspector input', async () => {
    const { container } = render(
      <StrictMode>
        <App />
      </StrictMode>,
    )

    fireEvent.change(screen.getAllByLabelText('JSON')[0], {
      target: { value: JSON_TEXT_PAYLOAD },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create From JSON' }))

    const inspectorPanel = container.querySelector('.inspector-panel')

    expect(inspectorPanel).not.toBeNull()

    const widthInput = await waitFor(() => within(inspectorPanel).getByLabelText('Width'))
    fireEvent.pointerDown(widthInput)

    expect(within(inspectorPanel).getByLabelText('Width')).toHaveValue(500)
    expect(within(inspectorPanel).getByLabelText('Height')).toHaveValue(200)
  })

})
