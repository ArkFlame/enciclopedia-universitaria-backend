const ImageShortcode = require('./ImageShortcode')
const TooltipShortcode = require('./TooltipShortcode')
const RefShortcode = require('./RefShortcode')

class ShortcodeProcessor {
  constructor(){
    this.handlers = [
      new ImageShortcode(),
      new TooltipShortcode(),
      new RefShortcode(),
    ]
  }
  process(input){
    return this.handlers.reduce((acc, h) => h.apply(acc), input)
  }
}

module.exports = new ShortcodeProcessor()
