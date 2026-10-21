local utils = require 'mp.utils'

local options = { control = '', run = '' }
require('mp.options').read_options(options, 'music-pane')

local seen = ''

local function report(kind, value)
  io.stdout:write(string.format('@%s %s\n', kind, value))
  io.stdout:flush()
end

mp.add_periodic_timer(0.1, function()
  local file = io.open(options.control, 'r')
  if not file then return end
  local text = file:read('*a')
  file:close()
  if text == seen then return end
  seen = text
  local wanted = utils.parse_json(text)
  if type(wanted) ~= 'table' or tostring(wanted.run) ~= options.run then return end
  if type(wanted.volume) == 'number' then mp.set_property_number('volume', wanted.volume) end
  if type(wanted.pause) == 'boolean' then mp.set_property_bool('pause', wanted.pause) end
end)

mp.add_periodic_timer(0.25, function()
  local position = mp.get_property_number('time-pos')
  if position then report('pos', string.format('%.3f', position)) end
  local length = mp.get_property_number('duration')
  if length then report('len', string.format('%.3f', length)) end
end)
