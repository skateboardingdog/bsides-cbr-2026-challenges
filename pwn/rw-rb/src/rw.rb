#!/usr/bin/env ruby

require "fiddle"

$stdin.sync = true
$stdout.sync = true

a = Array.new(128, 0)
loop do
  print "> "
  l = STDIN.gets or break
  c, *v = l.split
  case c
    when "r"
      puts a[v[0].to_i]
    when "w"
      Fiddle::Pointer.new(
        Fiddle::dlwrap(a)
      )[v[0].to_i] = v[1].to_i
  end
end
