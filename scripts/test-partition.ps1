$vol = Get-Volume -DriveLetter C
Write-Output "Volume size: $($vol.Size) free: $($vol.SizeRemaining)"
$part = Get-Partition | Where-Object { $_.AccessPaths -contains 'C:\' } | Select-Object -First 1
if ($part) {
  Write-Output "Partition found via AccessPaths"
  $part | Format-List DriveLetter, Size, DiskNumber
  $supported = Get-PartitionSupportedSize -InputObject $part
  Write-Output "SizeMin: $($supported.SizeMin) SizeMax: $($supported.SizeMax)"
} else {
  Write-Output "No partition via AccessPaths"
  Get-Partition | Format-Table DriveLetter, Size, AccessPaths -AutoSize
}
