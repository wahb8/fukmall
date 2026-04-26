import addImageIcon from '../../assets/add image.svg'
import upIcon from '../../assets/up.svg'

export function PromptShell() {
  return (
    <div className="canvas-prompt-shell">
      <button className="canvas-prompt-button canvas-prompt-button-left" type="button" aria-label="Add image">
        <img src={addImageIcon} alt="" aria-hidden="true" />
      </button>
      <input
        className="canvas-prompt-input"
        type="text"
        placeholder="Describe what you want to create..."
      />
      <button className="canvas-prompt-button canvas-prompt-button-right" type="button" aria-label="Submit prompt">
        <img src={upIcon} alt="" aria-hidden="true" />
      </button>
    </div>
  )
}
