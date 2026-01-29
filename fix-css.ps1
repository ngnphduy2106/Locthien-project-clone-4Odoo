# Fix CSS File - Remove Duplicate Code
$cssFile = "C:\Users\1\Desktop\Locthien-project\public\css\styles.css"

# Read all lines
$lines = Get-Content $cssFile

# Keep only lines 1-1749 (before the corruption)
$cleanLines = $lines[0..1748]

# Add proper closing for the last media query
$cleanLines += "}"

# Write back to file
$cleanLines | Set-Content $cssFile -Encoding UTF8

Write-Host "✅ CSS file fixed! Removed duplicate code."
Write-Host "Total lines: $($cleanLines.Count)"
