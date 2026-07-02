let counter = 0

module.exports = {
  v4: () => {
    counter++
    return `00000000-0000-0000-0000-${String(counter).padStart(12, '0')}`
  },
}
