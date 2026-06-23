export const AREA_COLORS = [
  '#2d6a4f', '#e07a5f', '#7b5ea7', '#c8982a',
  '#185fa5', '#2d9596', '#dc2626', '#d97706',
]

export function getAreaColor(areaName) {
  if (!areaName) return '#9898b8'
  let hash = 0
  for (let i = 0; i < areaName.length; i++) {
    hash = areaName.charCodeAt(i) + ((hash << 5) - hash)
  }
  return AREA_COLORS[Math.abs(hash) % AREA_COLORS.length]
}
