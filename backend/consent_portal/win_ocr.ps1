param(
    [Parameter(Mandatory=$true)]
    [string]$ImagePath
)

try {
    [Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime] | Out-Null
    [Windows.Media.Ocr.OcrEngine,Windows.Foundation.UniversalApiContract,ContentType=WindowsRuntime] | Out-Null
    [Windows.Graphics.Imaging.BitmapDecoder,Windows.Foundation.UniversalApiContract,ContentType=WindowsRuntime] | Out-Null

    $fullPath = [System.IO.Path]::GetFullPath($ImagePath)
    $fileOp = [Windows.Storage.StorageFile]::GetFileFromPathAsync($fullPath)
    while ($fileOp.Status -eq 'Started') { Start-Sleep -Milliseconds 10 }
    $file = $fileOp.GetResults()

    $streamOp = $file.OpenAsync([Windows.Storage.FileAccessMode]::Read)
    while ($streamOp.Status -eq 'Started') { Start-Sleep -Milliseconds 10 }
    $stream = $streamOp.GetResults()

    $decOp = [Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)
    while ($decOp.Status -eq 'Started') { Start-Sleep -Milliseconds 10 }
    $decoder = $decOp.GetResults()

    $bmpOp = $decoder.GetSoftwareBitmapAsync()
    while ($bmpOp.Status -eq 'Started') { Start-Sleep -Milliseconds 10 }
    $bitmap = $bmpOp.GetResults()

    $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
    if (-not $engine) {
        $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new('en-US'))
    }

    if ($engine) {
        $ocrOp = $engine.RecognizeAsync($bitmap)
        while ($ocrOp.Status -eq 'Started') { Start-Sleep -Milliseconds 10 }
        $ocrRes = $ocrOp.GetResults()
        if ($ocrRes -and $ocrRes.Text) {
            Write-Output $ocrRes.Text
        }
    }
} catch {
    Write-Error $_.Exception.Message
}
