// tslint:disable:no-magic-numbers

const isIssnStrict = /^(\d{4})-?(\d{3})([\dX])$/
const isIssnLax = new RegExp(isIssnStrict.source, 'i')

export function validate(issn) {
  const matches = text(issn).match(isIssnStrict)
  if (!matches) return false

  const actualCheckDigit = matches[3]
  const expectedCheckDigit = calculateCheckDigitFor(matches[1] + matches[2])
  return expectedCheckDigit === actualCheckDigit
}

export function format(issn) {
  const matches = text(issn).match(isIssnLax)
  return matches ? `${matches[1]}-${matches[2]}${matches[3]}`.toUpperCase() : undefined
}

const isDigitsForChecksum = /^(\d{7})$/
export function calculateCheckDigit(digits) {
  if (typeof digits !== 'string') throw new Error('Digits must be a string of 7 numeric characters.')

  if (!digits.match(isDigitsForChecksum)) throw new Error('Digits are malformed; expecting 7 numeric characters.')
  return calculateCheckDigitFor(digits)
}

function calculateCheckDigitFor(digits) {
  const result = digits.split('')
    .reverse()
    .reduce((sum, value, index) => sum + (value * (index + 2)), 0) % 11

  const checkDigit = (result === 0) ? 0 : 11 - result
  return checkDigit === 10 ? 'X' : checkDigit.toString()
}

function text(o) {
  return typeof o === 'string' ? o : ''
}
