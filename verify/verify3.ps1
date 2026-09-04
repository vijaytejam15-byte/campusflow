
$base = "http://localhost"
$p = 0; $f = 0; $log = [System.Collections.ArrayList]@()

function ok($label) { $script:p++; $null=$script:log.Add("  PASS  $label") }
function no($label) { $script:f++; $null=$script:log.Add("  FAIL  $label") }
function chk($label, $cond) { if ($cond) { ok $label } else { no $label } }

function iwr($method, $url, $body=$null, $sess=$null) {
  $p = @{ Uri="$base$url"; Method=$method; UseBasicParsing=$true; ErrorAction="SilentlyContinue" }
  if ($body -ne $null) { $p.Body = ($body|ConvertTo-Json -Compress -Depth 5); $p.ContentType = "application/json" }
  if ($sess) { $p.WebSession = $sess }
  try { return Invoke-WebRequest @p }
  catch {
    $r = $_.Exception.Response
    if ($r) { try { $s=New-Object IO.StreamReader($r.GetResponseStream()); $c=$s.ReadToEnd(); $s.Close() } catch { $c="" }
      return [PSCustomObject]@{StatusCode=[int]$r.StatusCode;Content=$c} }
    return [PSCustomObject]@{StatusCode=0;Content=$_.Exception.Message}
  }
}

$ts = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$stuE = "stu$ts@t.com"; $facE = "fac$ts@t.com"; $admE = "adm$ts@t.com"; $pw = "Pass1234x"

# ── 1. Health & Readiness ─────────────────────────────────────────────────────
$h = Invoke-WebRequest "$base/health" -UseBasicParsing
$r = Invoke-WebRequest "$base/ready"  -UseBasicParsing
chk "1a Health 200"          ($h.StatusCode -eq 200)
chk "1b Ready 200"           ($r.StatusCode -eq 200)
chk "1c status=ok"           (($h.Content|ConvertFrom-Json).status -eq "ok")
chk "1d db=connected"        (($r.Content|ConvertFrom-Json).db -eq "connected")

# ── 2. Auth ────────────────────────────────────────────────────────────────────
$ss = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$reg = Invoke-WebRequest "$base/api/register" -Method POST -ContentType "application/json" `
  -Body (@{name="E2E Student";email=$stuE;password=$pw}|ConvertTo-Json) -WebSession $ss -UseBasicParsing
chk "2a Register 201"        ($reg.StatusCode -eq 201)
chk "2b role=student"        (($reg.Content|ConvertFrom-Json).user.role -eq "student")

$me = Invoke-WebRequest "$base/api/me" -WebSession $ss -UseBasicParsing
chk "2c /me 200"             ($me.StatusCode -eq 200)

Invoke-WebRequest "$base/api/logout" -Method POST -ContentType "application/json" -Body "{}" -WebSession $ss -UseBasicParsing | Out-Null

$me2 = iwr GET "/api/me" $null $ss
chk "2d /me 401 after logout" ($me2.StatusCode -eq 401)

$li = Invoke-WebRequest "$base/api/login" -Method POST -ContentType "application/json" `
  -Body (@{email=$stuE;password=$pw}|ConvertTo-Json) -WebSession $ss -UseBasicParsing
chk "2e Login 200"           ($li.StatusCode -eq 200)

$bad = iwr POST "/api/login" @{email=$stuE;password="wrongpw"}
chk "2f Wrong pw 401"        ($bad.StatusCode -eq 401)

$unauth = Invoke-WebRequest "$base/api/me" -UseBasicParsing -ErrorAction SilentlyContinue
chk "2g No cookie 401"       ($unauth.StatusCode -eq 401)

# ── 3. Profile ────────────────────────────────────────────────────────────────
$pv = Invoke-WebRequest "$base/api/profile" -WebSession $ss -UseBasicParsing
chk "3a Profile GET 200"     ($pv.StatusCode -eq 200)

$pu = Invoke-WebRequest "$base/api/profile" -Method PUT -ContentType "application/json" `
  -Body (@{name="E2E Student";department="CS";semester="Sem 3"}|ConvertTo-Json) -WebSession $ss -UseBasicParsing
chk "3b Profile update 200"  ($pu.StatusCode -eq 200)
chk "3c Dept updated"        (($pu.Content|ConvertFrom-Json).user.department -eq "CS")

$pa = iwr PUT "/api/profile" @{avatar="not-a-url"} $ss
chk "3d Bad avatar 400"      ($pa.StatusCode -eq 400)

# ── 4. Courses ────────────────────────────────────────────────────────────────
$cc = Invoke-WebRequest "$base/api/courses" -Method POST -ContentType "application/json" `
  -Body (@{name="Algorithms";code="ALG$ts";instructor="Prof X";credits=3;semester="Sem 3"}|ConvertTo-Json) -WebSession $ss -UseBasicParsing
chk "4a Create course 201"   ($cc.StatusCode -eq 201)
$cid = ($cc.Content|ConvertFrom-Json).course._id

$cl = Invoke-WebRequest "$base/api/courses" -WebSession $ss -UseBasicParsing
chk "4b List courses 200"    ($cl.StatusCode -eq 200)

$cs = Invoke-WebRequest "$base/api/courses?search=Algo" -WebSession $ss -UseBasicParsing
chk "4c Search 200"          ($cs.StatusCode -eq 200)

$cu = Invoke-WebRequest "$base/api/courses/$cid" -Method PUT -ContentType "application/json" `
  -Body (@{name="Algorithms Updated"}|ConvertTo-Json) -WebSession $ss -UseBasicParsing
chk "4d Update 200"          ($cu.StatusCode -eq 200)

$dup = iwr POST "/api/courses" @{name="Dup";code="ALG$ts";instructor="X";credits=2;semester="Sem3"} $ss
chk "4e Dup code 409"        ($dup.StatusCode -eq 409)

$cd = iwr DELETE "/api/courses/$cid" $null $ss
chk "4f Delete 200"          ($cd.StatusCode -eq 200)

# ── 5. Requests ───────────────────────────────────────────────────────────────
$rq = Invoke-WebRequest "$base/api/requests" -Method POST -ContentType "application/json" `
  -Body (@{type="general";description="E2E verification request for full workflow testing";priority="normal";department="CS"}|ConvertTo-Json) -WebSession $ss -UseBasicParsing
chk "5a Create 201"          ($rq.StatusCode -eq 201)
$rqId = ($rq.Content|ConvertFrom-Json).request._id
chk "5b Has slaDeadline"     ($null -ne ($rq.Content|ConvertFrom-Json).request.slaDeadline)

$rl = Invoke-WebRequest "$base/api/requests" -WebSession $ss -UseBasicParsing
chk "5c List 200"            ($rl.StatusCode -eq 200)

$rf = Invoke-WebRequest "$base/api/requests?status=pending" -WebSession $ss -UseBasicParsing
chk "5d Filter 200"          ($rf.StatusCode -eq 200)

$ro = Invoke-WebRequest "$base/api/requests/$rqId" -WebSession $ss -UseBasicParsing
chk "5e Single 200"          ($ro.StatusCode -eq 200)

$rc = Invoke-WebRequest "$base/api/requests/$rqId/comment" -Method POST -ContentType "application/json" `
  -Body (@{comment="Additional info for E2E verification of comment feature"}|ConvertTo-Json) -WebSession $ss -UseBasicParsing
chk "5f Comment 201"         ($rc.StatusCode -eq 201)

$rd = iwr DELETE "/api/requests/$rqId" $null $ss
chk "5g Cancel 200"          ($rd.StatusCode -eq 200)

$sqb = iwr GET "/api/requests/pending" $null $ss
chk "5h Student blocked 403" ($sqb.StatusCode -eq 403)

# ── 6. Promote staff ──────────────────────────────────────────────────────────
$as = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$ar = Invoke-WebRequest "$base/api/register" -Method POST -ContentType "application/json" `
  -Body (@{name="E2E Admin";email=$admE;password=$pw}|ConvertTo-Json) -WebSession $as -UseBasicParsing
$aid = ($ar.Content|ConvertFrom-Json).user.id
docker exec campusflow_backend node -e "const m=require('mongoose'),U=require('./models/User');m.connect(process.env.MONGO_URI).then(async()=>{await U.findByIdAndUpdate('$aid',{role:'admin'});process.exit();})" 2>$null
Start-Sleep 1
Invoke-WebRequest "$base/api/login" -Method POST -ContentType "application/json" `
  -Body (@{email=$admE;password=$pw}|ConvertTo-Json) -WebSession $as -UseBasicParsing | Out-Null
$ame = Invoke-WebRequest "$base/api/me" -WebSession $as -UseBasicParsing
chk "6a Admin login 200"     ($ame.StatusCode -eq 200)
chk "6b Admin role"          (($ame.Content|ConvertFrom-Json).user.role -eq "admin")

$fs = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$fr = Invoke-WebRequest "$base/api/register" -Method POST -ContentType "application/json" `
  -Body (@{name="E2E Faculty";email=$facE;password=$pw}|ConvertTo-Json) -WebSession $fs -UseBasicParsing
$fid = ($fr.Content|ConvertFrom-Json).user.id
docker exec campusflow_backend node -e "const m=require('mongoose'),U=require('./models/User');m.connect(process.env.MONGO_URI).then(async()=>{await U.findByIdAndUpdate('$fid',{role:'faculty',department:'CS'});process.exit();})" 2>$null
Start-Sleep 1
Invoke-WebRequest "$base/api/login" -Method POST -ContentType "application/json" `
  -Body (@{email=$facE;password=$pw}|ConvertTo-Json) -WebSession $fs -UseBasicParsing | Out-Null
$fme = Invoke-WebRequest "$base/api/me" -WebSession $fs -UseBasicParsing
chk "6c Faculty login 200"   ($fme.StatusCode -eq 200)
chk "6d Faculty role"        (($fme.Content|ConvertFrom-Json).user.role -eq "faculty")

# ── 7. Faculty request review ─────────────────────────────────────────────────
$rq2 = Invoke-WebRequest "$base/api/requests" -Method POST -ContentType "application/json" `
  -Body (@{type="grade_appeal";description="Grade appeal E2E faculty review workflow test";priority="high";department="CS"}|ConvertTo-Json) -WebSession $ss -UseBasicParsing
$rqId2 = ($rq2.Content|ConvertFrom-Json).request._id

$pq = Invoke-WebRequest "$base/api/requests/pending" -WebSession $fs -UseBasicParsing
chk "7a Faculty queue 200"   ($pq.StatusCode -eq 200)

$app = Invoke-WebRequest "$base/api/requests/$rqId2/status" -Method PATCH -ContentType "application/json" `
  -Body (@{status="approved";comment="Approved by faculty reviewer E2E"}|ConvertTo-Json) -WebSession $fs -UseBasicParsing
chk "7b Faculty approves 200" ($app.StatusCode -eq 200)
chk "7c Status=approved"      (($app.Content|ConvertFrom-Json).request.status -eq "approved")

$rq3 = Invoke-WebRequest "$base/api/requests" -Method POST -ContentType "application/json" `
  -Body (@{type="transcript";description="Transcript E2E reject workflow test verification";priority="normal";department="CS"}|ConvertTo-Json) -WebSession $ss -UseBasicParsing
$rqId3 = ($rq3.Content|ConvertFrom-Json).request._id

$rjct = Invoke-WebRequest "$base/api/requests/$rqId3/status" -Method PATCH -ContentType "application/json" `
  -Body (@{status="rejected";comment="Rejected with reason E2E test"}|ConvertTo-Json) -WebSession $fs -UseBasicParsing
chk "7d Faculty rejects 200"  ($rjct.StatusCode -eq 200)

$rjnc = iwr PATCH "/api/requests/$rqId3/status" @{status="rejected"} $fs
chk "7e Reject no comment 400" ($rjnc.StatusCode -eq 400)

$rq4 = Invoke-WebRequest "$base/api/requests" -Method POST -ContentType "application/json" `
  -Body (@{type="financial_aid";description="Financial aid E2E escalation workflow test";priority="urgent";department="CS"}|ConvertTo-Json) -WebSession $ss -UseBasicParsing
$rqId4 = ($rq4.Content|ConvertFrom-Json).request._id

$esc = Invoke-WebRequest "$base/api/requests/$rqId4/status" -Method PATCH -ContentType "application/json" `
  -Body (@{status="escalated";comment="Escalating to HOD E2E test"}|ConvertTo-Json) -WebSession $fs -UseBasicParsing
chk "7f Faculty escalates 200" ($esc.StatusCode -eq 200)
chk "7g Status=escalated"      (($esc.Content|ConvertFrom-Json).request.status -eq "escalated")

# ── 8. Admin analytics & management ──────────────────────────────────────────
$mt = Invoke-WebRequest "$base/api/admin/metrics" -WebSession $as -UseBasicParsing
chk "8a Metrics 200"          ($mt.StatusCode -eq 200)

$an = Invoke-WebRequest "$base/api/admin/analytics" -WebSession $as -UseBasicParsing
chk "8b Analytics 200"        ($an.StatusCode -eq 200)
$anj = ($an.Content|ConvertFrom-Json).analytics
chk "8c Has totalRequests"    ($null -ne $anj.totalRequests)
chk "8d Has SLA"              ($null -ne $anj.sla)
chk "8e Has monthlyTrend"     ($null -ne $anj.monthlyTrend)

$stuan = iwr GET "/api/admin/analytics" $null $ss
chk "8f Student blocked 403"  ($stuan.StatusCode -eq 403)

$al = Invoke-WebRequest "$base/api/admin/audit-logs" -WebSession $as -UseBasicParsing
chk "8g Audit logs 200"       ($al.StatusCode -eq 200)

$allr = Invoke-WebRequest "$base/api/admin/requests" -WebSession $as -UseBasicParsing
chk "8h All requests 200"     ($allr.StatusCode -eq 200)

# ── 9. Admin user management ──────────────────────────────────────────────────
$ul = Invoke-WebRequest "$base/api/admin/users" -WebSession $as -UseBasicParsing
chk "9a User list 200"        ($ul.StatusCode -eq 200)

$nu = Invoke-WebRequest "$base/api/admin/users" -Method POST -ContentType "application/json" `
  -Body (@{name="Tmp";email="tmp$ts@t.com";password="Pass1234x";role="student"}|ConvertTo-Json) -WebSession $as -UseBasicParsing
chk "9b Create user 201"      ($nu.StatusCode -eq 201)
$nuid = ($nu.Content|ConvertFrom-Json).user.id

$rc2 = Invoke-WebRequest "$base/api/admin/users/$nuid/role" -Method PATCH -ContentType "application/json" `
  -Body (@{role="faculty"}|ConvertTo-Json) -WebSession $as -UseBasicParsing
chk "9c Role change 200"      ($rc2.StatusCode -eq 200)
chk "9d Role=faculty"         (($rc2.Content|ConvertFrom-Json).user.role -eq "faculty")

$brl = iwr PATCH "/api/admin/users/$nuid/role" @{role="superuser"} $as
chk "9e Bad role 400"         ($brl.StatusCode -eq 400)

$du = iwr DELETE "/api/admin/users/$nuid" $null $as
chk "9f Delete user 200"      ($du.StatusCode -eq 200)

$stubl = iwr GET "/api/admin/users" $null $ss
chk "9g Student blocked 403"  ($stubl.StatusCode -eq 403)

# ── 10. Leave types ───────────────────────────────────────────────────────────
$lt = Invoke-WebRequest "$base/api/leave-types" -Method POST -ContentType "application/json" `
  -Body (@{name="Medical$ts";maxDaysPerYear=10;requiresDocument=$false}|ConvertTo-Json) -WebSession $as -UseBasicParsing
chk "10a Create leave type 201" ($lt.StatusCode -eq 201)
$ltId = ($lt.Content|ConvertFrom-Json).leaveType._id

$ltl = Invoke-WebRequest "$base/api/leave-types" -WebSession $ss -UseBasicParsing
chk "10b Student sees types 200" ($ltl.StatusCode -eq 200)

$ltu = iwr POST "/api/leave-types" @{name="Hack"} $ss
chk "10c Student blocked 403"   ($ltu.StatusCode -eq 403)

# ── 11. Leave application ─────────────────────────────────────────────────────
$sd = (Get-Date).AddDays(3).ToString("yyyy-MM-dd")
$ed = (Get-Date).AddDays(5).ToString("yyyy-MM-dd")

$lv = Invoke-WebRequest "$base/api/leave" -Method POST -ContentType "application/json" `
  -Body (@{leaveTypeId=$ltId;startDate=$sd;endDate=$ed;reason="Medical appointment E2E verification leave test"}|ConvertTo-Json) -WebSession $ss -UseBasicParsing
chk "11a Apply leave 201"     ($lv.StatusCode -eq 201)
$lvId = ($lv.Content|ConvertFrom-Json).leave._id
chk "11b totalDays > 0"       (($lv.Content|ConvertFrom-Json).leave.totalDays -gt 0)
chk "11c status=pending"      (($lv.Content|ConvertFrom-Json).leave.status -eq "pending")

$bld = iwr POST "/api/leave" @{leaveTypeId=$ltId;startDate=$ed;endDate=$sd;reason="Bad dates"} $ss
chk "11d End before start 400" ($bld.StatusCode -eq 400)

$shr = iwr POST "/api/leave" @{leaveTypeId=$ltId;startDate=((Get-Date).AddDays(10).ToString("yyyy-MM-dd"));endDate=((Get-Date).AddDays(11).ToString("yyyy-MM-dd"));reason="short"} $ss
chk "11e Short reason 400"     ($shr.StatusCode -eq 400)

$ovl = iwr POST "/api/leave" @{leaveTypeId=$ltId;startDate=$sd;endDate=$ed;reason="Overlapping dates test"} $ss
chk "11f Overlap 409"          ($ovl.StatusCode -eq 409)

$myl = Invoke-WebRequest "$base/api/leave" -WebSession $ss -UseBasicParsing
chk "11g My leaves 200"        ($myl.StatusCode -eq 200)

$onl = Invoke-WebRequest "$base/api/leave/$lvId" -WebSession $ss -UseBasicParsing
chk "11h Single leave 200"     ($onl.StatusCode -eq 200)

# ── 12. Faculty leave review ──────────────────────────────────────────────────
$lq = Invoke-WebRequest "$base/api/leave/staff/queue" -WebSession $fs -UseBasicParsing
chk "12a Faculty leave queue 200" ($lq.StatusCode -eq 200)

$slq = iwr GET "/api/leave/staff/queue" $null $ss
chk "12b Student blocked 403"    ($slq.StatusCode -eq 403)

$lar = Invoke-WebRequest "$base/api/leave/$lvId/review" -Method PATCH -ContentType "application/json" `
  -Body (@{decision="approved";comment="Approved for medical E2E"}|ConvertTo-Json) -WebSession $fs -UseBasicParsing
chk "12c Approve leave 200"      ($lar.StatusCode -eq 200)
chk "12d Status=approved"        (($lar.Content|ConvertFrom-Json).leave.status -eq "approved")

$sd2 = (Get-Date).AddDays(15).ToString("yyyy-MM-dd")
$ed2 = (Get-Date).AddDays(16).ToString("yyyy-MM-dd")
$lv2 = Invoke-WebRequest "$base/api/leave" -Method POST -ContentType "application/json" `
  -Body (@{leaveTypeId=$ltId;startDate=$sd2;endDate=$ed2;reason="Second leave for cancel test E2E"}|ConvertTo-Json) -WebSession $ss -UseBasicParsing
$lvId2 = ($lv2.Content|ConvertFrom-Json).leave._id

$lrjnr = iwr PATCH "/api/leave/$lvId2/review" @{decision="rejected"} $fs
chk "12e Reject no reason 400"   ($lrjnr.StatusCode -eq 400)

# ── 13. Leave cancellation ────────────────────────────────────────────────────
$lcn = Invoke-WebRequest "$base/api/leave/$lvId2/cancel" -Method PATCH -WebSession $ss -UseBasicParsing
chk "13a Cancel pending 200"     ($lcn.StatusCode -eq 200)
chk "13b Status=cancelled"       (($lcn.Content|ConvertFrom-Json).leave.status -eq "cancelled")

$lca = iwr PATCH "/api/leave/$lvId/cancel" $null $ss
chk "13c Cannot cancel approved 409" ($lca.StatusCode -eq 409)

# ── 14. Admin leave reports ───────────────────────────────────────────────────
$ls = Invoke-WebRequest "$base/api/leave/admin/stats" -WebSession $as -UseBasicParsing
chk "14a Leave stats 200"     ($ls.StatusCode -eq 200)

$la = Invoke-WebRequest "$base/api/leave/admin/all" -WebSession $as -UseBasicParsing
chk "14b Admin all leaves 200" ($la.StatusCode -eq 200)

# ── 15. Correlation IDs ───────────────────────────────────────────────────────
$h1 = Invoke-WebRequest "$base/health" -UseBasicParsing
$h2 = Invoke-WebRequest "$base/health" -UseBasicParsing
chk "15a X-Request-ID present"  ($h1.Headers["X-Request-ID"] -ne $null)
chk "15b IDs unique"             ($h1.Headers["X-Request-ID"] -ne $h2.Headers["X-Request-ID"])

# ── 16. Refresh token ─────────────────────────────────────────────────────────
$rs = New-Object Microsoft.PowerShell.Commands.WebRequestSession
Invoke-WebRequest "$base/api/login" -Method POST -ContentType "application/json" `
  -Body (@{email=$stuE;password=$pw}|ConvertTo-Json) -WebSession $rs -UseBasicParsing | Out-Null
$rfr = Invoke-WebRequest "$base/api/refresh" -Method POST -WebSession $rs -UseBasicParsing
chk "16a Refresh 200"            ($rfr.StatusCode -eq 200)
chk "16b Returns user"           ($null -ne ($rfr.Content|ConvertFrom-Json).user)

# ── 17. Logout-all ────────────────────────────────────────────────────────────
$la3 = Invoke-WebRequest "$base/api/logout-all" -Method POST -WebSession $ss -UseBasicParsing
chk "17a Logout-all 200"         ($la3.StatusCode -eq 200)
$am2 = iwr GET "/api/me" $null $ss
chk "17b /me 401 after logout-all" ($am2.StatusCode -eq 401)

# ── 18. Swagger ───────────────────────────────────────────────────────────────
$sw = Invoke-WebRequest "$base/api/docs/" -UseBasicParsing
chk "18a Swagger 200"            ($sw.StatusCode -eq 200)

# ── Summary ───────────────────────────────────────────────────────────────────
""
"=================================================="
" CampusFlow E2E Verification — $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
"=================================================="
$log | ForEach-Object { $_ }
"=================================================="
" PASSED: $p   FAILED: $f   TOTAL: $($p+$f)"
"=================================================="
