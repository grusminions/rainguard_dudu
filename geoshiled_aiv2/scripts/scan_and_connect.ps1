$ErrorActionPreference = "Stop"

$ProjectRoot = "C:\Users\prane\OneDrive\Pictures\geoshiled_aiv2"
Set-Location $ProjectRoot

# 1. Scan & activate .venv
$VenvPython = Join-Path $ProjectRoot ".venv\Scripts\python.exe"
if (-not (Test-Path $VenvPython)) {
    python -m venv .venv
}
& $VenvPython -c "import sklearn, fastapi, uvicorn, httpx; print('Deps OK:', sklearn.__version__)"

# 2. Scan & train model artifact if missing
$ModelArtifact = Join-Path $ProjectRoot "backend\artifacts\flood_risk_model.joblib"
if (-not (Test-Path $ModelArtifact)) {
    & $VenvPython -m backend.train_model
}

# 3. Start FastAPI on port 8000 if not already listening
$PortBusy = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue
if (-not $PortBusy) {
    Start-Process -FilePath $VenvPython `
        -ArgumentList "-m", "uvicorn", "backend.main:app", "--host", "127.0.0.1", "--port", "8000" `
        -WorkingDirectory $ProjectRoot `
        -WindowStyle Minimized
    Start-Sleep -Seconds 2
}

# 4. Verify live health + model inference
$Health = Invoke-RestMethod -Uri "http://127.0.0.1:8000/health" -TimeoutSec 5
if (-not $Health.model_loaded) {
    throw "API reachable on :8000, but model_loaded is False."
}

$SamplePayload = @{
    rainfall        = 75.0
    slope           = 15.0
    soil_saturation = 0.8
    drainage_risk   = 0.7
    elevation       = 30.0
} | ConvertTo-Json

$Pred = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:8000/predict" -ContentType "application/json" -Body $SamplePayload -TimeoutSec 5
Write-Output ("CONNECTED | model={0} | prob={1} | tier={2}" -f $Health.model_name, $Pred.risk_probability, $Pred.risk_category)