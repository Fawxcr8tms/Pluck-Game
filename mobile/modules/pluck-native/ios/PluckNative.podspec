Pod::Spec.new do |s|
  s.name           = 'PluckNative'
  s.version        = '0.1.0'
  s.summary        = 'Sticker cut-out (Vision) and WhatsApp sticker-pack export for Pluck'
  s.author         = 'Pluck'
  s.homepage       = 'https://github.com/fawxcr8tms/pluck-game'
  s.license        = 'MIT'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true
  s.swift_version  = '5.9'

  s.dependency 'ExpoModulesCore'
  # Already in every Expo app through expo-image; iOS can read WebP but can't write it.
  s.dependency 'SDWebImageWebPCoder'

  s.source_files = '**/*.swift'
end
