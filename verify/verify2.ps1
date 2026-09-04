param()
$base = "http://localhost"
$pass = 0; $fail = 0

function check($label, $cond) {
  if ($cond) { $script:pass++; Write-Output "  PASS  $label" }
  else        { $script:fail++; Write-Output "  FAIL  $label" }
}

# Wrapper that never throws — always returns the response object
function req($method, $url, $body=$null, $sess=$null) {
  $p = @{ Uri="$base$url"; Method=$method; UseBasicParsing=$true; ErrorAction="SilentlyContinue" }
  if ($body)  { $p.Body = ($body|ConvertTo-Json -Compress); $p.ContentType = "application/json" }
  if ($sess)  { $p.WebSession = $sess }
  try { return Invoke-WebRequest @p }
  catch [System.Net.WebException] {
    $resp = $_.Exception.Response
    if ($resp -ne $null) {
      # Read body
      $sr = New-Object System.IO.StreamReader($resp.GetResponseStream())
      $body2 = $sr.ReadToEnd(); $sr.Close()
      # Build a pseudo-response object
      return [PSCustomObject]@{ StatusCode = [int]$resp.StatusCode; Content = $body2 }
    }
    return [PSCustomObject]@{ StatusCode = 0; Content = $_.Exception.Message }
  }
}

$ts = Get-Date -Format "HHmmss"
$stuEmail = "stu_$ts@test.com"
$facEmail = "fac_$ts@test.com"
$admEmail = "adm_$ts@test.com"
$pw = "Pass1234x"

# ── 1. Health & Readiness ─────────────────────────────────────────────────────
$h = req GET "/health"; check "1a Health 200" ($h.StatusCode -eq 200)
$r = req GET "/ready";  check "1b Ready 200"  ($r.StatusCode -eq 200)
$hj = $h.Content|ConvertFrom-Json
check "1c Health status=ok"      ($hj.status -eq "ok")
check "1d Ready db=connected"    (($r.Content|ConvertFrom-Json).db -eq "connected")

# ── 2. Authentication ──────────────────────────────────────────────────────────
$ss = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$reg = req POST "/api/register" @{name="E2E Student";email=$stuEmail;password=$pw} $ss
check "2a Register 201"          ($reg.StatusCode -eq 201)
check "2b Role = student"        (($reg.Content|ConvertFrom-Json).user.role -eq "student")

$me = req GET "/api/me" $ss
check "2c /api/me 200"           ($me.StatusCode -eq 200)

$lo = req POST "/api/logout" @{} $ss
check "2d Logout 200"            ($lo.StatusCode -eq 200)

$li = req POST "/api/login" @{email=$stuEmail;password=$pw} $ss
check "2e Login 200"             ($li.StatusCode -eq 200)

$bad = req POST "/api/login" @{email=$stuEmail;password="wrongpw"}
check "2f Wrong password 401"   ($bad.StatusCode -eq 401)

$unauth = req GET "/api/me"
check "2g No cookie = 401"      ($unauth.StatusCode -eq 401)

# ── 3. Profile ────────────────────────────────────────────────────────────────
$pv = req GET "/api/profile" $ss
check "3a Profile GET 200"       ($pv.StatusCode -eq 200)

$pu = req PUT "/api/profile" @{name="E2E Student";department="CS";semester="Sem 3"} $ss
check "3b Profile update 200"    ($pu.StatusCode -eq 200)
check "3c Department updated"    (($pu.Content|ConvertFrom-Json).user.department -eq "CS")

$pa = req PUT "/api/profile" @{avatar="not-a-url"} $ss
check "3d Bad avatar 400"        ($pa.StatusCode -eq 400)

# ── 4. Course CRUD ────────────────────────────────────────────────────────────
$cc = req POST "/api/courses" @{name="Algorithms";code="ALG$ts";instructor="Prof X";credits=3;semester="Sem 3"} $ss
check "4a Create course 201"     ($cc.StatusCode -eq 201)
$cid = ($cc.Content|ConvertFrom-Json).course._id

$cl = req GET "/api/courses" $ss
check "4b List courses 200"      ($cl.StatusCode -eq 200)

$cs = req GET "/api/courses?search=Algo" $ss
check "4c Search courses 200"    ($cs.StatusCode -eq 200)

$cu = req PUT "/api/courses/$cid" @{name="Algorithms Updated"} $ss
check "4d Update course 200"     ($cu.StatusCode -eq 200)

$dup = req POST "/api/courses" @{name="Dup";code="ALG$ts";instructor="X";credits=2;semester="Sem 3"} $ss
check "4e Duplicate code 409"    ($dup.StatusCode -eq 409)

$cd = req DELETE "/api/courses/$cid" $ss
check "4f Delete course 200"     ($cd.StatusCode -eq 200)

# ── 5. Student requests ────────────────────────────────────────────────────────
$rq = req POST "/api/requests" @{type="general";description="E2E verification request testing all workflows";priority="normal";department="CS"} $ss
check "5a Create request 201"    ($rq.StatusCode -eq 201)
$rqId = ($rq.Content|ConvertFrom-Json).request._id
check "5b Has slaDeadline"       ($null -ne ($rq.Content|ConvertFrom-Json).request.slaDeadline)

$rl = req GET "/api/requests" $ss
check "5c List requests 200"     ($rl.StatusCode -eq 200)

$rf = req GET "/api/requests?status=pending" $ss
check "5d Filter by status 200"  ($rf.StatusCode -eq 200)

$ro = req GET "/api/requests/$rqId" $ss
check "5e Single request 200"    ($ro.StatusCode -eq 200)

$rc = req POST "/api/requests/$rqId/comment" @{comment="Additional info for the E2E verification test"} $ss
check "5f Add comment 201"       ($rc.StatusCode -eq 201)

$rd = req DELETE "/api/requests/$rqId" $ss
check "5g Cancel request 200"    ($rd.StatusCode -eq 200)

# ── 6. Promote accounts via exec ──────────────────────────────────────────────
$as = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$ar = req POST "/api/register" @{name="E2E Admin";email=$admEmail;password=$pw} $as
$aid = ($ar.Content|ConvertFrom-Json).user.id
$cmd = "const m=require('mongoose'),U=require('./models/User');m.connect(process.env.MONGO_URI).then(async()=>{await U.findByIdAndUpdate('$aid',{role:'admin'});process.exit();})"
docker exec campusflow_backend node -e $cmd 2>$null; Start-Sleep -Seconds 1
$ali = req POST "/api/login" @{email=$admEmail;password=$pw} $as
check "6a Admin login 200"       ($ali.StatusCode -eq 200)

$fs = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$fr = req POST "/api/register" @{name="E2E Faculty";email=$facEmail;password=$pw} $fs
$fid = ($fr.Content|ConvertFrom-Json).user.id
$cmd2 = "const m=require('mongoose'),U=require('./models/User');m.connect(process.env.MONGO_URI).then(async()=>{await U.findByIdAndUpdate('$fid',{role:'faculty',department:'CS'});process.exit();})"
docker exec campusflow_backend node -e $cmd2 2>$null; Start-Sleep -Seconds 1
$fli = req POST "/api/login" @{email=$facEmail;password=$pw} $fs
check "6b Faculty login 200"     ($fli.StatusCode -eq 200)

# ── 7. Faculty review ─────────────────────────────────────────────────────────
$rq2 = req POST "/api/requests" @{type="grade_appeal";description="Grade appeal for E2E faculty review workflow testing";priority="high";department="CS"} $ss
$rqId2 = ($rq2.Content|ConvertFrom-Json).request._id

$pq = req GET "/api/requests/pending" $fs
check "7a Faculty pending queue 200" ($pq.StatusCode -eq 200)

$sq = req GET "/api/requests/pending" $ss
check "7b Student blocked 403"   ($sq.StatusCode -eq 403)

$ap = req PATCH "/api/requests/$rqId2/status" @{status="approved";comment="Approved by faculty reviewer"} $fs
check "7c Faculty approves 200"  ($ap.StatusCode -eq 200)
check "7d Status = approved"     (($ap.Content|ConvertFrom-Json).request.status -eq "approved")

$rq3 = req POST "/api/requests" @{type="transcript";description="Transcript request E2E reject workflow testing verification";priority="normal";department="CS"} $ss
$rqId3 = ($rq3.Content|ConvertFrom-Json).request._id

$rj = req PATCH "/api/requests/$rqId3/status" @{status="rejected";comment="Rejected by reviewer E2E test"} $fs
check "7e Faculty rejects 200"   ($rj.StatusCode -eq 200)

$rjnc = req PATCH "/api/requests/$rqId3/status" @{status="rejected"} $fs
check "7f Reject no comment 400" ($rjnc.StatusCode -eq 400)

$rq4 = req POST "/api/requests" @{type="financial_aid";description="Financial aid request E2E escalation workflow testing";priority="urgent";department="CS"} $ss
$rqId4 = ($rq4.Content|ConvertFrom-Json).request._id

$esc = req PATCH "/api/requests/$rqId4/status" @{status="escalated";comment="Escalating to HOD for final decision"} $fs
check "7g Faculty escalates 200" ($esc.StatusCode -eq 200)

# ── 8. Admin checks ───────────────────────────────────────────────────────────
$mt = req GET "/api/admin/metrics" $as
check "8a Admin metrics 200"     ($mt.StatusCode -eq 200)

$an = req GET "/api/admin/analytics" $as
check "8b Analytics 200"         ($an.StatusCode -eq 200)
$anj = ($an.Content|ConvertFrom-Json).analytics
check "8c Analytics has totalRequests" ($null -ne $anj.totalRequests)
check "8d Analytics has SLA"     ($null -ne $anj.sla)
check "8e Analytics has monthlyTrend" ($null -ne $anj.monthlyTrend)

$stuan = req GET "/api/admin/analytics" $ss
check "8f Student blocked 403"   ($stuan.StatusCode -eq 403)

$al = req GET "/api/admin/audit-logs" $as
check "8g Audit logs 200"        ($al.StatusCode -eq 200)

$ar2 = req GET "/api/admin/requests" $as
check "8h Admin all requests 200" ($ar2.StatusCode -eq 200)

# ── 9. Admin user management ─────────────────────────────────────────────────
$ul = req GET "/api/admin/users" $as
check "9a User list 200"         ($ul.StatusCode -eq 200)

$nu = req POST "/api/admin/users" @{name="Tmp User";email="tmp_$ts@test.com";password="Pass1234x";role="student"} $as
check "9b Create user 201"       ($nu.StatusCode -eq 201)
$nuid = ($nu.Content|ConvertFrom-Json).user.id

$rc2 = req PATCH "/api/admin/users/$nuid/role" @{role="faculty"} $as
check "9c Change role 200"       ($rc2.StatusCode -eq 200)
check "9d Role = faculty"        (($rc2.Content|ConvertFrom-Json).user.role -eq "faculty")

$brl = req PATCH "/api/admin/users/$nuid/role" @{role="superuser"} $as
check "9e Bad role 400"          ($brl.StatusCode -eq 400)

$du = req DELETE "/api/admin/users/$nuid" $as
check "9f Delete user 200"       ($du.StatusCode -eq 200)

$stubl = req GET "/api/admin/users" $ss
check "9g Student blocked 403"   ($stubl.StatusCode -eq 403)

# ── 10. Leave types ───────────────────────────────────────────────────────────
$lt = req POST "/api/leave-types" @{name="Medical $ts";maxDaysPerYear=10;requiresDocument=$false} $as
check "10a Create leave type 201" ($lt.StatusCode -eq 201)
$ltId = ($lt.Content|ConvertFrom-Json).leaveType._id

$ltl = req GET "/api/leave-types" $ss
check "10b Student sees types 200" ($ltl.StatusCode -eq 200)

$ltu = req POST "/api/leave-types" @{name="Hack"} $ss
check "10c Student blocked 403"   ($ltu.StatusCode -eq 403)

# ── 11. Leave application ─────────────────────────────────────────────────────
$sd = (Get-Date).AddDays(3).ToString("yyyy-MM-dd")
$ed = (Get-Date).AddDays(5).ToString("yyyy-MM-dd")

$lv = req POST "/api/leave" @{leaveTypeId=$ltId;startDate=$sd;endDate=$ed;reason="Medical appointment E2E leave verification test"} $ss
check "11a Apply leave 201"       ($lv.StatusCode -eq 201)
$lvId = ($lv.Content|ConvertFrom-Json).leave._id
check "11b totalDays > 0"         (($lv.Content|ConvertFrom-Json).leave.totalDays -gt 0)
check "11c Status = pending"      (($lv.Content|ConvertFrom-Json).leave.status -eq "pending")

$bld = req POST "/api/leave" @{leaveTypeId=$ltId;startDate=$ed;endDate=$sd;reason="Bad dates test"} $ss
check "11d End before start 400"  ($bld.StatusCode -eq 400)

$shr = req POST "/api/leave" @{leaveTypeId=$ltId;startDate=((Get-Date).AddDays(10).ToString("yyyy-MM-dd"));endDate=((Get-Date).AddDays(11).ToString("yyyy-MM-dd"));reason="short"} $ss
check "11e Short reason 400"      ($shr.StatusCode -eq 400)

$ovl = req POST "/api/leave" @{leaveTypeId=$ltId;startDate=$sd;endDate=$ed;reason="Overlapping dates detection test"} $ss
check "11f Overlap 409"           ($ovl.StatusCode -eq 409)

$myl = req GET "/api/leave" $ss
check "11g List my leaves 200"    ($myl.StatusCode -eq 200)

$onl = req GET "/api/leave/$lvId" $ss
check "11h Single leave 200"      ($onl.StatusCode -eq 200)

# ── 12. Faculty leave review ──────────────────────────────────────────────────
$lq = req GET "/api/leave/staff/queue" $fs
check "12a Faculty leave queue 200" ($lq.StatusCode -eq 200)

$slq = req GET "/api/leave/staff/queue" $ss
check "12b Student blocked 403"   ($slq.StatusCode -eq 403)

$lar = req PATCH "/api/leave/$lvId/review" @{decision="approved";comment="Approved for medical"} $fs
check "12c Faculty approves leave 200" ($lar.StatusCode -eq 200)
check "12d Leave status = approved"    (($lar.Content|ConvertFrom-Json).leave.status -eq "approved")

$sd2 = (Get-Date).AddDays(15).ToString("yyyy-MM-dd")
$ed2 = (Get-Date).AddDays(16).ToString("yyyy-MM-dd")
$lv2 = req POST "/api/leave" @{leaveTypeId=$ltId;startDate=$sd2;endDate=$ed2;reason="Second leave for cancel test"} $ss
$lvId2 = ($lv2.Content|ConvertFrom-Json).leave._id

$lrj = req PATCH "/api/leave/$lvId2/review" @{decision="rejected"} $fs
check "12e Reject no reason 400"  ($lrj.StatusCode -eq 400)

# ── 13. Leave cancellation ────────────────────────────────────────────────────
$lcn = req PATCH "/api/leave/$lvId2/cancel" $null $ss
check "13a Cancel pending leave 200" ($lcn.StatusCode -eq 200)
check "13b Status = cancelled"       (($lcn.Content|ConvertFrom-Json).leave.status -eq "cancelled")

$lca = req PATCH "/api/leave/$lvId/cancel" $null $ss
check "13c Cannot cancel approved 409" ($lca.StatusCode -eq 409)

# ── 14. Admin leave stats ─────────────────────────────────────────────────────
$ls = req GET "/api/leave/admin/stats" $as
check "14a Leave stats 200"       ($ls.StatusCode -eq 200)

$la = req GET "/api/leave/admin/all" $as
check "14b Admin all leaves 200"  ($la.StatusCode -eq 200)

# ── 15. Correlation IDs ───────────────────────────────────────────────────────
$h1 = Invoke-WebRequest "$base/health" -UseBasicParsing
$h2 = Invoke-WebRequest "$base/health" -UseBasicParsing
check "15a X-Request-ID present"   ($h1.Headers["X-Request-ID"] -ne $null)
check "15b IDs are unique"          ($h1.Headers["X-Request-ID"] -ne $h2.Headers["X-Request-ID"])

# ── 16. Refresh token ─────────────────────────────────────────────────────────
$rs = New-Object Microsoft.PowerShell.Commands.WebRequestSession
req POST "/api/login" @{email=$stuEmail;password=$pw} $rs | Out-Null
$rf2 = req POST "/api/refresh" $null $rs
check "16a Refresh token 200"     ($rf2.StatusCode -eq 200)
check "16b Refresh returns user"  ($null -ne ($rf2.Content|ConvertFrom-Json).user)

# ── 17. Logout-all ────────────────────────────────────────────────────────────
$la2 = req POST "/api/logout-all" $null $ss
check "17a Logout-all 200"        ($la2.StatusCode -eq 200)
$am = req GET "/api/me" $ss
check "17b /me = 401 after logout-all" ($am.StatusCode -eq 401)

# ── 18. Swagger docs ──────────────────────────────────────────────────────────
$sw = req GET "/api/docs/"
check "18a Swagger UI 200"        ($sw.StatusCode -eq 200)

# ── Summary ───────────────────────────────────────────────────────────────────
Write-Output ""
Write-Output "=================================="
Write-Output " CampusFlow E2E Results"
Write-Output "=================================="
Write-Output " PASSED: $pass"
Write-Output " FAILED: $fail"
Write-Output " TOTAL:  $($pass+$fail)"
Write-Output "=================================="
