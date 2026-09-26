<#
  Publisher (.pub) -> JSON shape dump, for the DRAIS ID Card Studio importer.

  A .pub file is a proprietary Microsoft binary; only Publisher itself can read it reliably. This script
  drives an installed Publisher through COM, reads every shape's real geometry/style/text (including the
  measured bounds of each label/value segment) and writes plain JSON. The pure importer
  (src/lib/idcards/publisher-import.ts) turns that JSON into a design with placeholders.

  Usage (Windows, Publisher installed):
    powershell -ExecutionPolicy Bypass -File scripts/idcards/publisher-extract.ps1 -Pub "BACKUP\ID TEMP.pub" -Out shapes.json

  All coordinates are in points (1/72 inch), page origin top-left, exactly as Publisher reports them.
#>
param(
  [Parameter(Mandatory = $true)][string]$Pub,
  [Parameter(Mandatory = $true)][string]$Out
)
$ErrorActionPreference = 'Stop'

function Rgb($v) {
  # Publisher RGB is a BGR integer.
  $n = [int]$v
  if ($n -lt 0) { return $null }
  '#{0:x2}{1:x2}{2:x2}' -f ($n -band 255), (($n -shr 8) -band 255), (($n -shr 16) -band 255)
}

function Segments($tr, [string]$text, [int]$base) {
  # Split a line into segments separated by 2+ spaces or a tab, measuring and styling each one in the page.
  # $base = 0-based offset of $text inside the whole text range.
  $segs = @()
  foreach ($m in [regex]::Matches($text, '[^\t]+?(?=\s{2,}|\t|$)')) {
    $t = $m.Value.Trim()
    if (-not $t) { continue }
    $start = $base + $m.Index + $m.Value.IndexOf($t) + 1
    try {
      $c = $tr.Characters($start, $t.Length)
      $segs += [ordered]@{
        text = $t; left = [double]$c.BoundLeft; top = [double]$c.BoundTop; width = [double]$c.BoundWidth; height = [double]$c.BoundHeight
        font = $c.Font.Name; size = [double]$c.Font.Size; bold = ([int]$c.Font.Bold -eq -1); italic = ([int]$c.Font.Italic -eq -1); color = (Rgb $c.Font.ForeColor.RGB)
      }
    } catch { $segs += [ordered]@{ text = $t } }
  }
  ,$segs
}

function Dump($s, $z, $group) {
  $o = [ordered]@{
    name = $s.Name; type = [int]$s.Type; z = $z; group = $group
    left = [double]$s.Left; top = [double]$s.Top; width = [double]$s.Width; height = [double]$s.Height
    rotation = [double]$s.Rotation
    fill = [ordered]@{ visible = ([int]$s.Fill.Visible -ne 0); color = (Rgb $s.Fill.ForeColor.RGB); transparency = [double]$s.Fill.Transparency }
    line = [ordered]@{ visible = ([int]$s.Line.Visible -ne 0); color = (Rgb $s.Line.ForeColor.RGB); weight = [double]$s.Line.Weight; dash = [int]$s.Line.DashStyle }
  }
  $hasText = $false
  try { $hasText = [bool]$s.HasTextFrame } catch {}
  if ($hasText) {
    $tr = $s.TextFrame.TextRange
    $o.text_margins = [ordered]@{ left = [double]$s.TextFrame.MarginLeft; top = [double]$s.TextFrame.MarginTop; right = [double]$s.TextFrame.MarginRight; bottom = [double]$s.TextFrame.MarginBottom }
    # Publisher's Paragraphs/Lines collections only report the first paragraph on some files, so split the
    # raw text on paragraph marks (CR) / line breaks (VT) and measure each piece by character range.
    $lines = @()
    $full = [string]$tr.Text
    $offset = 0
    foreach ($piece in [regex]::Split($full, '(?<=[\r\v])')) {
      $txt = ($piece -replace "[\r\n\v]+", '')
      if ($txt.Trim()) {
        $lead = $piece.Length - $piece.TrimStart().Length
        $l = $tr.Characters($offset + 1, $txt.Length)
        $lines += [ordered]@{
          text = $txt; align = [int]$l.ParagraphFormat.Alignment
          left = [double]$l.BoundLeft; top = [double]$l.BoundTop; width = [double]$l.BoundWidth; height = [double]$l.BoundHeight
          segments = (Segments $tr $txt $offset)
        }
      }
      $offset += $piece.Length
    }
    $o.lines = $lines
  }
  $o
}

$app = New-Object -ComObject Publisher.Application
try {
  $doc = $app.Open((Resolve-Path $Pub).Path, $true, $false)
  $pages = @()
  foreach ($page in $doc.Pages) {
    $shapes = @(); $z = 0
    foreach ($s in $page.Shapes) {
      if ([int]$s.Type -eq 6) {
        foreach ($gi in $s.GroupItems) { $shapes += (Dump $gi $z $s.Name); $z++ }
      } else { $shapes += (Dump $s $z $null); $z++ }
    }
    $pages += [ordered]@{ index = [int]$page.PageIndex; shapes = $shapes }
  }
  $result = [ordered]@{
    source = [IO.Path]::GetFileName($Pub)
    page = [ordered]@{ widthPt = [double]$doc.PageSetup.PageWidth; heightPt = [double]$doc.PageSetup.PageHeight }
    pages = $pages
  }
  $doc.Close()
  $json = $result | ConvertTo-Json -Depth 10
  [IO.File]::WriteAllText($Out, $json, (New-Object Text.UTF8Encoding($false)))
  "Wrote $Out ($($pages.Count) page(s), $(($pages | ForEach-Object { $_.shapes.Count } | Measure-Object -Sum).Sum) shapes)"
} finally { $app.Quit() }
