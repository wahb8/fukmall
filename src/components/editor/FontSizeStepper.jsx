import { PressAndHoldRepeatButton } from './PressAndHoldRepeatButton'

export function FontSizeStepper({
  value,
  min = 8,
  max = undefined,
  inputRef,
  inputPointerDown,
  onDecrementStep,
  onIncrementStep,
  onStepStop,
  onStepperPointerDown,
  onInputFocus,
  onInputChange,
  onInputBlur,
  onInputKeyDown,
}) {
  return (
    <label className="property-field">
      <span>Font Size</span>
      <div className="number-stepper" data-text-style-control="true">
        <PressAndHoldRepeatButton
          className="number-stepper-button"
          data-text-style-control="true"
          aria-label="Decrease font size"
          onPointerDown={onStepperPointerDown}
          onStep={onDecrementStep}
          onStop={onStepStop}
        >
          -
        </PressAndHoldRepeatButton>
        <input
          ref={inputRef}
          type="number"
          min={min}
          max={max}
          value={value}
          data-text-style-control="true"
          onPointerDown={inputPointerDown}
          onFocus={onInputFocus}
          onChange={onInputChange}
          onBlur={onInputBlur}
          onKeyDown={onInputKeyDown}
        />
        <PressAndHoldRepeatButton
          className="number-stepper-button"
          data-text-style-control="true"
          aria-label="Increase font size"
          onPointerDown={onStepperPointerDown}
          onStep={onIncrementStep}
          onStop={onStepStop}
        >
          +
        </PressAndHoldRepeatButton>
      </div>
    </label>
  )
}
