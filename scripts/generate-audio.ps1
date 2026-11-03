$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$speechRoot = Split-Path -Parent $PSScriptRoot
$speechManifest = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'speech-manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$courseSynth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $courseVoice = $courseSynth.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -eq 'en-US' } | Select-Object -First 1
  if (-not $courseVoice) { throw 'An English (US) system voice is required to regenerate course audio.' }
  $courseSynth.SelectVoice($courseVoice.VoiceInfo.Name)
  $courseSynth.Rate = -1
  $courseFormat = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(22050, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
  foreach ($clip in $speechManifest) {
    $clipPath = Join-Path (Join-Path $speechRoot 'docs/audio') $clip.file
    $courseSynth.SetOutputToWaveFile($clipPath, $courseFormat)
    $courseSynth.Speak($clip.text)
    $courseSynth.SetOutputToNull()
  }
  Write-Output "Generated $($speechManifest.Count) English audio clips."
} finally { $courseSynth.Dispose() }
