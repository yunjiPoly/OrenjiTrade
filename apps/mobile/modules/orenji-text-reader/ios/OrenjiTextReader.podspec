Pod::Spec.new do |s|
  s.name           = 'OrenjiTextReader'
  s.version        = '0.1.0'
  s.summary        = 'Reads the text of a still card photo on the device (Apple Vision)'
  s.description    = 'The card scan reader of OrenjiTrade: VNRecognizeTextRequest on a local image file, no network, no copy kept.'
  s.author         = 'OrenjiTrade'
  s.homepage       = 'https://www.orenjitrade.com'
  s.license        = { :type => 'UNLICENSED' }
  s.platforms      = {
    :ios => '16.4'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'Vision', 'UIKit'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
