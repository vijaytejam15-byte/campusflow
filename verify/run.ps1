Set-StrictMode -Off
$base = "http://localhost"
$p = 0; $f = 0; $log = New-Object System.Collections.Generic.List[string]

function apicall {
  param($method, $url, $body=$null, $sess=$null)
  $prm = @{ Uri="$base$url"; Method=$method; UseBasicParsing=$true; ErrorAction="SilentlyContinue" }
  if ($body -ne $null) { $prm.Body = ($body | ConvertTo-Json -Compress -Depth 5); $prm.ContentType = "application/json" }
  if ($sess -ne $null) { $prm.WebSession = $sess }
  try {
    return Invoke-WebRequest @prm
  } catch {
    $resp = $_.Exception.Response
    if ($resp) {
      try { $sr = New-Object System.IO.StreamReader($resp.GetResponseStream()); $c = $sr.ReadToEnd(); $sr.Close() } catch { $c = "" }
      return [PSCustomObject]@{ StatusCode = [int]$resp.StatusCode; Content = $c }
    }
    return [PSCustomObject]@{ StatusCode = 0; Content = $_.Exception.Message }
  }
}

function chk($label, $cond) {
  if ($cond) { $script:p++; $script:log.Add("  PASS  $label") }
  else       { $script:f++; $script:log.Add("  FAIL  $label") }
}

$ts  = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$stuE = "stu$ts@t.com"; $facE = "fac$ts@t.com"; $admE = "adm$ts@t.com"; $pw = "Pass1234x"

# ── 1. Health & Readiness ─────────────────────────────────────────────────────
$h1 = apicall GET "/health"; $r1 = apicall GET "/ready"
chk "1a Health 200"           ($h1.StatusCode -eq 200)
chk "1b Ready 200"            ($r1.StatusCode -eq 200)
chk "1c status=ok"            (($h1.Content | ConvertFrom-Json).status -eq "ok")
chk "1d db=connected"         (($r1.Content | ConvertFrom-Json).db -eq "connected")

# ── 2. Auth ────────────────────────────────────────────────────────────────────
$ss = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$reg = Invoke-WebRequest "$base/api/register" -Method POST -ContentType "application/json" `
  -Body (@{name="E2E Student";email=$stuE;password=$pw} | ConvertTo-Json) -WebSession $ss -UseBasicParsing
chk "2a Register 201"         ($reg.StatusCode -eq 201)
chk "2b role=student"         (($reg.Content | ConvertFrom-Json).user.role -eq "student")
$me1 = Invoke-WebRequest "$base/api/me" -WebSession $ss -UseBasicParsing
chk "2c /me 200 (cookie)"     ($me1.StatusCode -eq 200)
Invoke-WebRequest "$base/api/logout" -Method POST -ContentType "application/json" -Body "{}" -WebSession $ss -UseBasicParsing | Out-Null
$me2 = apicall GET "/api/me" $null $ss
chk "2d 401 after logout"     ($me2.StatusCode -eq 401)
$li = Invoke-WebRequest "$base/api/login" -Method POST -ContentType "application/json" `
  -Body (@{email=$stuE;password=$pw} | ConvertTo-Json) -WebSession $ss -UseBasicParsing
chk "2e Login 200"            ($li.StatusCode -eq 200)
$bad = apicall POST "/api/login" @{email=$stuE;password="wrongpw"}
chk "2f Wrong pw 401"         ($bad.StatusCode -eq 401)
$noauth = apicall GET "/api/me"
chk "2g No cookie = 401"      ($noauth.StatusCode -eq 401)

# ── 3. Profile ────────────────────────────────────────────────────────────────
$pv = Invoke-WebRequest "$base/api/profile" -WebSession $ss -UseBasicParsing
chk "3a Profile GET 200"      ($pv.StatusCode -eq 200)
$pu = Invoke-WebRequest "$base/api/profile" -Method PUT -ContentType "application/json" `
  -Body (@{name="E2E Student";department="CS";semester="Sem3"} | ConvertTo-Json) -WebSession $ss -UseBasicParsing
chk "3b Profile update 200"   ($pu.StatusCode -eq 200)
chk "3c Dept = CS"            (($pu.Content | ConvertFrom-Json).user.department -eq "CS")
$pa = apicall PUT "/api/profile" @{avatar="not-a-url"} $ss
chk "3d Bad avatar 400"       ($pa.StatusCode -eq 400)

# ── 4. Courses ────────────────────────────────────────────────────────────────
$cc = Invoke-WebRequest "$base/api/courses" -Method POST -ContentType "application/json" `
  -Body (@{name="Algorithms";code="ALG$ts";instructor="ProfX";credits=3;semester="Sem3"} | ConvertTo-Json) -WebSession $ss -UseBasicParsing
chk "4a Create course 201"    ($cc.StatusCode -eq 201)
$cid = ($cc.Content | ConvertFrom-Json).course._id
$cl = Invoke-WebRequest "$base/api/courses" -WebSession $ss -UseBasicParsing
chk "4b List courses 200"     ($cl.StatusCode -eq 200)
$csrch = Invoke-WebRequest "$base/api/courses?search=Alg" -WebSession $ss -UseBasicParsing
chk "4c Search 200"           ($csrch.StatusCode -eq 200)
$cu = Invoke-WebRequest "$base/api/courses/$cid" -Method PUT -ContentType "application/json" `
  -Body (@{name="Algorithms Updated"} | ConvertTo-Json) -WebSession $ss -UseBasicParsing
chk "4d Update 200"           ($cu.StatusCode -eq 200)
$dup = apicall POST "/api/courses" @{name="D";code="ALG$ts";instructor="X";credits=2;semester="S"} $ss
chk "4e Dup code 409"         ($dup.StatusCode -eq 409)
$cdel = apicall DELETE "/api/courses/$cid" $null $ss
chk "4f Delete 200"           ($cdel.StatusCode -eq 200)

# ── 5. Requests ────────────────────────────────────────────────────────────────
$rq = Invoke-WebRequest "$base/api/requests" -Method POST -ContentType "application/json" `
  -Body (@{type="general";description="E2E verification request for full workflow testing suite";priority="normal";department="CS"} | ConvertTo-Json) -WebSession $ss -UseBasicParsing
chk "5a Create request 201"   ($rq.StatusCode -eq 201)
$rqId = ($rq.Content | ConvertFrom-Json).request._id
chk "5b Has slaDeadline"      ($null -ne ($rq.Content | ConvertFrom-Json).request.slaDeadline)
$rl = Invoke-WebRequest "$base/api/requests" -WebSession $ss -UseBasicParsing
chk "5c List 200"             ($rl.StatusCode -eq 200)
$rfilt = Invoke-WebRequest "$base/api/requests?status=pending" -WebSession $ss -UseBasicParsing
chk "5d Filter 200"           ($rfilt.StatusCode -eq 200)
$rone = Invoke-WebRequest "$base/api/requests/$rqId" -WebSession $ss -UseBasicParsing
chk "5e Single 200"           ($rone.StatusCode -eq 200)
$rcmt = Invoke-WebRequest "$base/api/requests/$rqId/comment" -Method POST -ContentType "application/json" `
  -Body (@{comment="Additional info for E2E verification test comment feature"} | ConvertTo-Json) -WebSession $ss -UseBasicParsing
chk "5f Comment 201"          ($rcmt.StatusCode -eq 201)
$rdel = apicall DELETE "/api/requests/$rqId" $null $ss
chk "5g Cancel 200"           ($rdel.StatusCode -eq 200)
$sqblk = apicall GET "/api/requests/pending" $null $ss
chk "5h Student blocked 403"  ($sqblk.StatusCode -eq 403)

# ── 6. Promote admin & faculty ────────────────────────────────────────────────
$as = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$ar = Invoke-WebRequest "$base/api/register" -Method POST -ContentType "application/json" `
  -Body (@{name="E2E Admin";email=$admE;password=$pw} | ConvertTo-Json) -WebSession $as -UseBasicParsing
$aid = ($ar.Content | ConvertFrom-Json).user.id
$cmd1 = "const m=require('mongoose'),U=require('./models/User');m.connect(process.env.MONGO_URI).then(async()=>{await U.findByIdAndUpdate('$aid',{role:'admin'});process.exit();})"
docker exec campusflow_backend node -e $cmd1 2>$null; Start-Sleep -Seconds 1
Invoke-WebRequest "$base/api/login" -Method POST -ContentType "application/json" `
  -Body (@{email=$admE;password=$pw} | ConvertTo-Json) -WebSession $as -UseBasicParsing | Out-Null
$ame = Invoke-WebRequest "$base/api/me" -WebSession $as -UseBasicParsing
chk "6a Admin login + role"   (($ame.Content | ConvertFrom-Json).user.role -eq "admin")

$fs = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$fr = Invoke-WebRequest "$base/api/register" -Method POST -ContentType "application/json" `
  -Body (@{name="E2E Faculty";email=$facE;password=$pw} | ConvertTo-Json) -WebSession $fs -UseBasicParsing
$fid = ($fr.Content | ConvertFrom-Json).user.id
$cmd2 = "const m=require('mongoose'),U=require('./models/User');m.connect(process.env.MONGO_URI).then(async()=>{await U.findByIdAndUpdate('$fid',{role:'faculty',department:'CS'});process.exit();})"
docker exec campusflow_backend node -e $cmd2 2>$null; Start-Sleep -Seconds 1
Invoke-WebRequest "$base/api/login" -Method POST -ContentType "application/json" `
  -Body (@{email=$facE;password=$pw} | ConvertTo-Json) -WebSession $fs -UseBasicParsing | Out-Null
$fme = Invoke-WebRequest "$base/api/me" -WebSession $fs -UseBasicParsing
chk "6b Faculty login + role" (($fme.Content | ConvertFrom-Json).user.role -eq "faculty")

# ── 7. Request review workflow ────────────────────────────────────────────────
$rq2 = Invoke-WebRequest "$base/api/requests" -Method POST -ContentType "application/json" `
  -Body (@{type="grade_appeal";description="Grade appeal for E2E faculty review workflow test";priority="high";department="CS"} | ConvertTo-Json) -WebSession $ss -UseBasicParsing
$rqId2 = ($rq2.Content | ConvertFrom-Json).request._id
$pq = Invoke-WebRequest "$base/api/requests/pending" -WebSession $fs -UseBasicParsing
chk "7a Faculty queue 200"    ($pq.StatusCode -eq 200)
$app = Invoke-WebRequest "$base/api/requests/$rqId2/status" -Method PATCH -ContentType "application/json" `
  -Body (@{status="approved";comment="Approved E2E faculty test"} | ConvertTo-Json) -WebSession $fs -UseBasicParsing
chk "7b Approve 200"          ($app.StatusCode -eq 200)
chk "7c status=approved"      (($app.Content | ConvertFrom-Json).request.status -eq "approved")

$rq3 = Invoke-WebRequest "$base/api/requests" -Method POST -ContentType "application/json" `
  -Body (@{type="transcript";description="Transcript E2E reject workflow test";priority="normal";department="CS"} | ConvertTo-Json) -WebSession $ss -UseBasicParsing
$rqId3 = ($rq3.Content | ConvertFrom-Json).request._id
$rjct = Invoke-WebRequest "$base/api/requests/$rqId3/status" -Method PATCH -ContentType "application/json" `
  -Body (@{status="rejected";comment="Rejected E2E test reason"} | ConvertTo-Json) -WebSession $fs -UseBasicParsing
chk "7d Reject 200"           ($rjct.StatusCode -eq 200)
$rjnc = apicall PATCH "/api/requests/$rqId3/status" @{status="rejected"} $fs
chk "7e Reject no comment 400" ($rjnc.StatusCode -eq 400)

$rq4 = Invoke-WebRequest "$base/api/requests" -Method POST -ContentType "application/json" `
  -Body (@{type="financial_aid";description="Financial aid E2E escalation workflow test";priority="urgent";department="CS"} | ConvertTo-Json) -WebSession $ss -UseBasicParsing
$rqId4 = ($rq4.Content | ConvertFrom-Json).request._id
$esc = Invoke-WebRequest "$base/api/requests/$rqId4/status" -Method PATCH -ContentType "application/json" `
  -Body (@{status="escalated";comment="Escalating to HOD E2E"} | ConvertTo-Json) -WebSession $fs -UseBasicParsing
chk "7f Escalate 200"         ($esc.StatusCode -eq 200)
chk "7g status=escalated"     (($esc.Content | ConvertFrom-Json).request.status -eq "escalated")

# ── 8. Admin ──────────────────────────────────────────────────────────────────
$mt = Invoke-WebRequest "$base/api/admin/metrics" -WebSession $as -UseBasicParsing
chk "8a Metrics 200"          ($mt.StatusCode -eq 200)
$an = Invoke-WebRequest "$base/api/admin/analytics" -WebSession $as -UseBasicParsing
chk "8b Analytics 200"        ($an.StatusCode -eq 200)
$anj = ($an.Content | ConvertFrom-Json).analytics
chk "8c totalRequests"        ($null -ne $anj.totalRequests)
chk "8d SLA metrics"          ($null -ne $anj.sla)
chk "8e monthlyTrend"         ($null -ne $anj.monthlyTrend)
$stuan = apicall GET "/api/admin/analytics" $null $ss
chk "8f Student blocked 403"  ($stuan.StatusCode -eq 403)
$aulg = Invoke-WebRequest "$base/api/admin/audit-logs" -WebSession $as -UseBasicParsing
chk "8g Audit logs 200"       ($aulg.StatusCode -eq 200)
$allr = Invoke-WebRequest "$base/api/admin/requests" -WebSession $as -UseBasicParsing
chk "8h All requests 200"     ($allr.StatusCode -eq 200)

# ── 9. Admin user management ──────────────────────────────────────────────────
$ul = Invoke-WebRequest "$base/api/admin/users" -WebSession $as -UseBasicParsing
chk "9a User list 200"        ($ul.StatusCode -eq 200)
$nu = Invoke-WebRequest "$base/api/admin/users" -Method POST -ContentType "application/json" `
  -Body (@{name="Tmp";email="tmp$ts@t.com";password="Pass1234x";role="student"} | ConvertTo-Json) -WebSession $as -UseBasicParsing
chk "9b Create user 201"      ($nu.StatusCode -eq 201)
$nuid = ($nu.Content | ConvertFrom-Json).user.id
$rc2 = Invoke-WebRequest "$base/api/admin/users/$nuid/role" -Method PATCH -ContentType "application/json" `
  -Body (@{role="faculty"} | ConvertTo-Json) -WebSession $as -UseBasicParsing
chk "9c Role change 200"      ($rc2.StatusCode -eq 200)
chk "9d role=faculty"         (($rc2.Content | ConvertFrom-Json).user.role -eq "faculty")
$brl = apicall PATCH "/api/admin/users/$nuid/role" @{role="superuser"} $as
chk "9e Bad role 400"         ($brl.StatusCode -eq 400)
$dlu = apicall DELETE "/api/admin/users/$nuid" $null $as
chk "9f Delete user 200"      ($dlu.StatusCode -eq 200)
$stbl = apicall GET "/api/admin/users" $null $ss
chk "9g Student blocked 403"  ($stbl.StatusCode -eq 403)

# ── 10. Leave types ────────────────────────────────────────────────────────────
$lt = Invoke-WebRequest "$base/api/leave-types" -Method POST -ContentType "application/json" `
  -Body (@{name="Medical$ts";maxDaysPerYear=10;requiresDocument=$false} | ConvertTo-Json) -WebSession $as -UseBasicParsing
chk "10a Create type 201"     ($lt.StatusCode -eq 201)
$ltId = ($lt.Content | ConvertFrom-Json).leaveType._id
$ltl = Invoke-WebRequest "$base/api/leave-types" -WebSession $ss -UseBasicParsing
chk "10b Student sees types"  ($ltl.StatusCode -eq 200)
$ltu = apicall POST "/api/leave-types" @{name="Hack"} $ss
chk "10c Student blocked 403" ($ltu.StatusCode -eq 403)

# ── 11. Leave application ──────────────────────────────────────────────────────
$sd = (Get-Date).AddDays(3).ToString("yyyy-MM-dd")
$ed = (Get-Date).AddDays(5).ToString("yyyy-MM-dd")
$lv = Invoke-WebRequest "$base/api/leave" -Method POST -ContentType "application/json" `
  -Body (@{leaveTypeId=$ltId;startDate=$sd;endDate=$ed;reason="Medical E2E verification leave test"} | ConvertTo-Json) -WebSession $ss -UseBasicParsing
chk "11a Apply 201"           ($lv.StatusCode -eq 201)
$lvId = ($lv.Content | ConvertFrom-Json).leave._id
chk "11b totalDays > 0"       (($lv.Content | ConvertFrom-Json).leave.totalDays -gt 0)
chk "11c status=pending"      (($lv.Content | ConvertFrom-Json).leave.status -eq "pending")
$bld = apicall POST "/api/leave" @{leaveTypeId=$ltId;startDate=$ed;endDate=$sd;reason="Bad dates"} $ss
chk "11d End<Start 400"       ($bld.StatusCode -eq 400)
$shr = apicall POST "/api/leave" @{leaveTypeId=$ltId;startDate=((Get-Date).AddDays(10).ToString("yyyy-MM-dd"));endDate=((Get-Date).AddDays(11).ToString("yyyy-MM-dd"));reason="short"} $ss
chk "11e Short reason 400"    ($shr.StatusCode -eq 400)
$ovl = apicall POST "/api/leave" @{leaveTypeId=$ltId;startDate=$sd;endDate=$ed;reason="Overlapping dates detection"} $ss
chk "11f Overlap 409"         ($ovl.StatusCode -eq 409)
$myl = Invoke-WebRequest "$base/api/leave" -WebSession $ss -UseBasicParsing
chk "11g My leaves 200"       ($myl.StatusCode -eq 200)
$onl = Invoke-WebRequest "$base/api/leave/$lvId" -WebSession $ss -UseBasicParsing
chk "11h Single leave 200"    ($onl.StatusCode -eq 200)

# ── 12. Faculty leave review ───────────────────────────────────────────────────
$lq = Invoke-WebRequest "$base/api/leave/staff/queue" -WebSession $fs -UseBasicParsing
chk "12a Staff queue 200"     ($lq.StatusCode -eq 200)
$slq = apicall GET "/api/leave/staff/queue" $null $ss
chk "12b Student blocked 403" ($slq.StatusCode -eq 403)
$lar = Invoke-WebRequest "$base/api/leave/$lvId/review" -Method PATCH -ContentType "application/json" `
  -Body (@{decision="approved";comment="Approved medical E2E"} | ConvertTo-Json) -WebSession $fs -UseBasicParsing
chk "12c Approve leave 200"   ($lar.StatusCode -eq 200)
chk "12d status=approved"     (($lar.Content | ConvertFrom-Json).leave.status -eq "approved")
$sd2 = (Get-Date).AddDays(15).ToString("yyyy-MM-dd"); $ed2 = (Get-Date).AddDays(16).ToString("yyyy-MM-dd")
$lv2 = Invoke-WebRequest "$base/api/leave" -Method POST -ContentType "application/json" `
  -Body (@{leaveTypeId=$ltId;startDate=$sd2;endDate=$ed2;reason="Second leave for cancel test E2E"} | ConvertTo-Json) -WebSession $ss -UseBasicParsing
$lvId2 = ($lv2.Content | ConvertFrom-Json).leave._id
$lrjnr = apicall PATCH "/api/leave/$lvId2/review" @{decision="rejected"} $fs
chk "12e Reject no reason 400" ($lrjnr.StatusCode -eq 400)

# ── 13. Leave cancellation ─────────────────────────────────────────────────────
$lcn = Invoke-WebRequest "$base/api/leave/$lvId2/cancel" -Method PATCH -WebSession $ss -UseBasicParsing
chk "13a Cancel pending 200"  ($lcn.StatusCode -eq 200)
chk "13b status=cancelled"    (($lcn.Content | ConvertFrom-Json).leave.status -eq "cancelled")
$lca = apicall PATCH "/api/leave/$lvId/cancel" $null $ss
chk "13c Cannot cancel approved 409" ($lca.StatusCode -eq 409)

# ── 14. Admin leave reports ────────────────────────────────────────────────────
$ls = Invoke-WebRequest "$base/api/leave/admin/stats" -WebSession $as -UseBasicParsing
chk "14a Leave stats 200"     ($ls.StatusCode -eq 200)
$la = Invoke-WebRequest "$base/api/leave/admin/all" -WebSession $as -UseBasicParsing
chk "14b Admin all leaves 200" ($la.StatusCode -eq 200)

# ── 15. Correlation IDs ────────────────────────────────────────────────────────
$hc1 = Invoke-WebRequest "$base/health" -UseBasicParsing
$hc2 = Invoke-WebRequest "$base/health" -UseBasicParsing
chk "15a X-Request-ID present" ($hc1.Headers["X-Request-ID"] -ne $null)
chk "15b IDs unique"           ($hc1.Headers["X-Request-ID"] -ne $hc2.Headers["X-Request-ID"])

# ── 16. Refresh token ──────────────────────────────────────────────────────────
$rs = New-Object Microsoft.PowerShell.Commands.WebRequestSession
Invoke-WebRequest "$base/api/login" -Method POST -ContentType "application/json" `
  -Body (@{email=$stuE;password=$pw} | ConvertTo-Json) -WebSession $rs -UseBasicParsing | Out-Null
$rfr = Invoke-WebRequest "$base/api/refresh" -Method POST -WebSession $rs -UseBasicParsing
chk "16a Refresh 200"         ($rfr.StatusCode -eq 200)
chk "16b Returns user"        ($null -ne ($rfr.Content | ConvertFrom-Json).user)

# ── 17. Logout-all ─────────────────────────────────────────────────────────────
$la3 = Invoke-WebRequest "$base/api/logout-all" -Method POST -WebSession $ss -UseBasicParsing
chk "17a Logout-all 200"      ($la3.StatusCode -eq 200)
$am2 = apicall GET "/api/me" $null $ss
chk "17b 401 after logout-all" ($am2.StatusCode -eq 401)

# ── 18. Swagger ────────────────────────────────────────────────────────────────
$sw = Invoke-WebRequest "$base/api/docs/" -UseBasicParsing
chk "18a Swagger 200"         ($sw.StatusCode -eq 200)

# ── Summary ────────────────────────────────────────────────────────────────────
""
"=================================================="
" CampusFlow E2E Results - $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
"=================================================="
$log | ForEach-Object { Write-Output $_ }
"=================================================="
" PASSED: $p   FAILED: $f   TOTAL: $($p + $f)"
"=================================================="
