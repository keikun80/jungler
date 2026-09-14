#!/usr/bin/env pwsh
# Usage: .\scripts\deploy-all.ps1 [-Profile <PROFILE_NAME>] [-Region <REGION>]

param(
    [string]$Profile = "",
    [string]$Region = "",
    [string]$StackName = ""
)

# Load environment configuration
$envFile = "../env.json"
if (Test-Path $envFile) {
    $envConfig = Get-Content $envFile -Raw | ConvertFrom-Json
    if (-not $Profile -and $envConfig.HUB_PROFILE) { $Profile = $envConfig.HUB_PROFILE }
    if (-not $Region -and $envConfig.REGION) { $Region = $envConfig.REGION }
    if (-not $StackName -and $envConfig.STACK_NAME) { $StackName = $envConfig.STACK_NAME }
    Write-Host "Loaded configuration from $envFile" -ForegroundColor Yellow
}

$gitBranch = (git rev-parse --abbrev-ref HEAD 2>$null)
$defaultStack = "jungle-tools-stack"
if ($gitBranch -eq "develop") {
    $defaultStack = "dev-jungle"
}

if (-not $Profile) { $Profile = "hub-profile" }
if (-not $Region) { $Region = "ap-northeast-2" }
if (-not $StackName) { $StackName = $defaultStack }

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "Jungle Tools Console Deployment" -ForegroundColor Cyan
Write-Host "Stack Name: $StackName" -ForegroundColor Cyan
Write-Host "Profile: $Profile" -ForegroundColor Cyan
Write-Host "Region: $Region" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# Step 0: Generate env.json if not exists
Write-Host "`n[Step 0] Checking environment configuration..." -ForegroundColor Yellow
if (-not (Test-Path "../env.json")) {
    Write-Host "env.json not found. Please run generate-env-json.ps1 first." -ForegroundColor Red
    exit 1
}

# Step 1: Install backend dependencies
Write-Host "`n[Step 1] Installing backend dependencies..." -ForegroundColor Yellow
Set-Location "../backend"
Write-Host "Running: npm install" -ForegroundColor Gray
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to install backend dependencies." -ForegroundColor Red
    exit 1
}
Set-Location "../"

# Step 2: Build SAM application
Write-Host "`n[Step 2] Building SAM application..." -ForegroundColor Yellow
Write-Host "Running: sam build" -ForegroundColor Gray
sam build --template-file template.yaml --build-dir .aws-sam/build --use-container
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to build SAM application." -ForegroundColor Red
    exit 1
}

# Step 3: Deploy SAM application
Write-Host "`n[Step 3] Deploying SAM application..." -ForegroundColor Yellow

$targetAccList = @()
if ($envConfig.HUB_ACCOUNT_ID) {
    $targetAccList += @{ id = $envConfig.HUB_ACCOUNT_ID; name = "Hub ($($envConfig.HUB_PROFILE))" }
}
if ($envConfig.SPOKE_PROFILES) {
    foreach ($spoke in $envConfig.SPOKE_PROFILES) {
        $targetAccList += @{
            id = $spoke.accountId;
            name = $spoke.profile;
            roleArn = "arn:aws:iam::$($spoke.accountId):role/JungleToolsCrossAccountRole"
        }
    }
}
$scanTargetAccountsJson = $targetAccList | ConvertTo-Json -Compress

Write-Host "Running: sam deploy with ScanTargetAccountsJson" -ForegroundColor Gray
sam deploy `
    --template-file .aws-sam/build/template.yaml `
    --stack-name $StackName `
    --resolve-s3 `
    --capabilities CAPABILITY_NAMED_IAM `
    --region $Region `
    --profile $Profile `
    --parameter-overrides "ScanTargetAccountsJson='$scanTargetAccountsJson'" `
    --no-fail-on-empty-changeset `
    --no-confirm-changeset
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to deploy SAM application." -ForegroundColor Red
    exit 1
}

# Step 4: Get S3 bucket name and sync frontend
Write-Host "`n[Step 4] Syncing frontend to S3..." -ForegroundColor Yellow
$stackOutputs = aws cloudformation describe-stacks `
    --stack-name $StackName `
    --query "Stacks[0].Outputs[?OutputKey=='FrontendWebsiteUrl'].OutputValue" `
    --output text `
    --profile $Profile `
    --region $Region `
    --no-paginate

if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to get stack outputs from $StackName." -ForegroundColor Red
    exit 1
}

# Extract bucket name from website URL (e.g., https://bucket-name.s3-website.region.amazonaws.com)
$bucketName = ($stackOutputs -split '/')[2]
Write-Host "S3 Bucket Name: $bucketName" -ForegroundColor Green

Write-Host "Running: aws s3 sync frontend/ s3://$bucketName/" -ForegroundColor Gray
aws s3 sync ../frontend/ "s3://$bucketName/" `
    --profile $Profile `
    --region $Region `
    --delete `
    --no-paginate

if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to sync frontend to S3." -ForegroundColor Red
    exit 1
}

# Summary
Write-Host "`n============================================================" -ForegroundColor Green
Write-Host "Deployment Completed Successfully!" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host "`nCloudFormation Stack: $StackName" -ForegroundColor White
Write-Host "Frontend URL: $stackOutputs" -ForegroundColor Cyan
Write-Host "`nNext Steps:" -ForegroundColor Yellow
Write-Host "  1. Open the Frontend URL in your browser" -ForegroundColor White
Write-Host "  2. Configure IAM credentials with MFA for authentication" -ForegroundColor White
Write-Host "  3. Refer to README.md for usage instructions" -ForegroundColor White
