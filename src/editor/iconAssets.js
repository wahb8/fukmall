import addImageIcon from '../assets/add image.svg'
import addLayerIcon from '../assets/add layer.svg'
import addTextIcon from '../assets/add text.svg'
import bucketIcon from '../assets/bucket.svg'
import closeIcon from '../assets/Close (X).svg'
import downIcon from '../assets/down.svg'
import duplicateIcon from '../assets/duplicate.svg'
import eraserIcon from '../assets/eraser.svg'
import gradientIcon from '../assets/gradient.svg'
import hiddenIcon from '../assets/Hidden.svg'
import lassoIcon from '../assets/lasso.svg'
import marqueeIcon from '../assets/marquee.svg'
import mergeDownIcon from '../assets/merge down.svg'
import penIcon from '../assets/pen.svg'
import pointerIcon from '../assets/pointer.svg'
import redoIcon from '../assets/redo.svg'
import undoIcon from '../assets/undo.svg'
import upIcon from '../assets/up.svg'
import visibleIcon from '../assets/Visible.svg'
import zoomIcon from '../assets/zoom.svg'

import darkAddImageIcon from '../assets/dark icons/add image.svg'
import darkAddLayerIcon from '../assets/dark icons/add layer.svg'
import darkAddTextIcon from '../assets/dark icons/add text.svg'
import darkBucketIcon from '../assets/dark icons/bucket.svg'
import darkDownIcon from '../assets/dark icons/down.svg'
import darkDuplicateIcon from '../assets/dark icons/duplicate.svg'
import darkEraserIcon from '../assets/dark icons/eraser.svg'
import darkLassoIcon from '../assets/dark icons/lasso.svg'
import darkMarqueeIcon from '../assets/dark icons/marquee.svg'
import darkMergeDownIcon from '../assets/dark icons/marge down.svg'
import darkRedoIcon from '../assets/dark icons/redo.svg'
import darkUndoIcon from '../assets/dark icons/undo.svg'
import darkUpIcon from '../assets/dark icons/up.svg'
import darkVisibleIcon from '../assets/dark icons/Visible.svg'
import darkZoomIcon from '../assets/dark icons/zoom.svg'

const ICONS = {
  addImage: { light: addImageIcon, dark: darkAddImageIcon },
  addLayer: { light: addLayerIcon, dark: darkAddLayerIcon },
  addText: { light: addTextIcon, dark: darkAddTextIcon },
  bucket: { light: bucketIcon, dark: darkBucketIcon },
  close: { light: closeIcon },
  down: { light: downIcon, dark: darkDownIcon },
  duplicate: { light: duplicateIcon, dark: darkDuplicateIcon },
  eraser: { light: eraserIcon, dark: darkEraserIcon },
  gradient: { light: gradientIcon },
  hidden: { light: hiddenIcon },
  lasso: { light: lassoIcon, dark: darkLassoIcon },
  marquee: { light: marqueeIcon, dark: darkMarqueeIcon },
  mergeDown: { light: mergeDownIcon, dark: darkMergeDownIcon },
  pen: { light: penIcon },
  pointer: { light: pointerIcon },
  redo: { light: redoIcon, dark: darkRedoIcon },
  undo: { light: undoIcon, dark: darkUndoIcon },
  up: { light: upIcon, dark: darkUpIcon },
  visible: { light: visibleIcon, dark: darkVisibleIcon },
  zoom: { light: zoomIcon, dark: darkZoomIcon },
}

export function getThemeIcon(name, theme) {
  const iconEntry = ICONS[name]

  if (!iconEntry) {
    return ''
  }

  if (theme === 'dark' && iconEntry.dark) {
    return iconEntry.dark
  }

  return iconEntry.light
}

export function getEditorIcons(theme) {
  return Object.fromEntries(
    Object.keys(ICONS).map((iconName) => [iconName, getThemeIcon(iconName, theme)]),
  )
}
