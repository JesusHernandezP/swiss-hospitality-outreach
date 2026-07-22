# n8n API Helper Script
# Uses session cookie auth to interact with n8n REST API

param(
    [string]$Action,
    [string]$Data = ""
)

$N8N_URL = "http://localhost:5678"
$EMAIL = "admin@swiss-outreach.local"
$PASSWORD = "SwissOutreach2024!"

# Login and get session
function Get-N8nSession {
    $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
    $loginBody = @{
        emailOrLdapLoginId = $EMAIL
        password = $PASSWORD
    } | ConvertTo-Json
    
    $null = Invoke-WebRequest -Uri "$N8N_URL/rest/login" `
        -Method Post `
        -ContentType "application/json" `
        -Body $loginBody `
        -WebSession $session `
        -UseBasicParsing
    
    return $session
}

# Generic API call
function Invoke-N8nApi {
    param(
        [string]$Method = "GET",
        [string]$Endpoint,
        [string]$Body = "",
        $Session
    )
    
    $params = @{
        Uri = "$N8N_URL$Endpoint"
        Method = $Method
        WebSession = $Session
        UseBasicParsing = $true
        ContentType = "application/json"
    }
    if ($Body) {
        $params.Body = $Body
    }
    
    $r = Invoke-WebRequest @params
    return $r.Content
}

# Execute action
$session = Get-N8nSession

switch ($Action) {
    "test" {
        $result = Invoke-N8nApi -Endpoint "/rest/settings" -Session $session
        Write-Output $result
    }
    "list-workflows" {
        $result = Invoke-N8nApi -Endpoint "/rest/workflows" -Session $session
        Write-Output $result
    }
    "create-workflow" {
        $result = Invoke-N8nApi -Method "POST" -Endpoint "/rest/workflows" -Body $Data -Session $session
        Write-Output $result
    }
    "import-workflow" {
        # Import from file path provided in $Data
        $jsonContent = Get-Content -Path $Data -Raw
        $result = Invoke-N8nApi -Method "POST" -Endpoint "/rest/workflows" -Body $jsonContent -Session $session
        Write-Output $result
    }
    "create-tag" {
        $result = Invoke-N8nApi -Method "POST" -Endpoint "/rest/tags" -Body $Data -Session $session
        Write-Output $result
    }
    "list-tags" {
        $result = Invoke-N8nApi -Endpoint "/rest/tags" -Session $session
        Write-Output $result
    }
    "create-variable" {
        $result = Invoke-N8nApi -Method "POST" -Endpoint "/rest/variables" -Body $Data -Session $session
        Write-Output $result
    }
    "list-variables" {
        $result = Invoke-N8nApi -Endpoint "/rest/variables" -Session $session
        Write-Output $result
    }
    "activate-all" {
        $workflowsJson = Invoke-N8nApi -Endpoint "/rest/workflows" -Session $session | ConvertFrom-Json
        foreach ($wf in $workflowsJson.data) {
            $body = @{ active = $true } | ConvertTo-Json
            $res = Invoke-N8nApi -Method "PATCH" -Endpoint "/rest/workflows/$($wf.id)" -Body $body -Session $session
            Write-Host "Activated workflow: $($wf.name) ($($wf.id))"
        }
    }
    default {
        Write-Output "Usage: n8n-api.ps1 -Action <test|list-workflows|activate-all|create-workflow|import-workflow|create-tag|list-tags|create-variable|list-variables> [-Data <json|filepath>]"
    }
}
