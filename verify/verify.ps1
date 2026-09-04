
# CampusFlow end-to-end verification script
# Run from project root: powershell -File verify\verify.ps1
$base = "http://localhost"
$pass = 0; $fail = 0; $results = @()

function Check($label, $condition, $detail="") {
  if ($condition) {
    $script:pass++
    $results += "  PASS  $label"
  } else {
    $script:fail++
    $results += "  FAIL  $label  $detail"
  }
}

function Post($url, $body, $session=$null) {
  $params = @{ Uri="$base$url"; Method="POST"; Body=($body|ConvertTo-Json);
    ContentType="application/json"; UseBasicParsing=$true; ErrorAction="SilentlyContinue" }
  if ($session) { $params["WebSession"]=$session }
  try { Invoke-WebRequest @params } catch { $_.Exception.Response }
}
function Get($url, $session=$null) {
  $params = @{ Uri="$base$url"; UseBasicParsing=$true; ErrorAction="SilentlyContinue" }
  if ($session) { $params["WebSession"]=$session }
  try { Invoke-WebRequest @params } catch { $_.Exception.Response }
}
function Patch($url, $body, $session) {
  $params = @{ Uri="$base$url"; Method="PATCH"; Body=($body|ConvertTo-Json);
    ContentType="application/json"; UseBasicParsing=$true; WebSession=$session; ErrorAction="SilentlyContinue" }
  try { Invoke-WebRequest @params } catch { $_.Exception.Response }
}
function Delete($url, $session) {
  $params = @{ Uri="$base$url"; Method="DELETE"; UseBasicParsing=$true;
    WebSession=$session; ErrorAction="SilentlyContinue" }
  try { Invoke-WebRequest @params } catch { $_.Exception.Response }
}

$ts = [int][double]::Parse((Get-Date -UFormat %s))
$stuEmail = "verify_stu_$ts@test.com"
$facEmail = "verify_fac_$ts@test.com"
$hodEmail = "verify_hod_$ts@test.com"
$admEmail = "verify_adm_$ts@test.com"
$pass1    = "Verify123!"

# ── 1. Health & Readiness ─────────────────────────────────────────────────────
$hth = Get "/health"; Check "1a Health endpoint 200"  ($hth.StatusCode -eq 200)
$rdy = Get "/ready";  Check "1b Readiness endpoint 200" ($rdy.StatusCode -eq 200)
$hBody = $hth.Content | ConvertFrom-Json
Check "1c Health returns status=ok"  ($hBody.status -eq "ok")
$rBody = $rdy.Content | ConvertFrom-Json
Check "1d Ready returns db=connected" ($rBody.db -eq "connected")

# ── 2. Student authentication ─────────────────────────────────────────────────
$stuSess = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$reg = Post "/api/register" @{name="Verify Student";email=$stuEmail;password=$pass1} $stuSess
Check "2a Student register 201" ($reg.StatusCode -eq 201)
$regBody = $reg.Content | ConvertFrom-Json
Check "2b Register returns role=student" ($regBody.user.role -eq "student")

# /api/me
$me = Get "/api/me" $stuSess
Check "2c /api/me returns 200" ($me.StatusCode -eq 200)

# Logout
$lo = Post "/api/logout" @{} $stuSess
Check "2d Logout 200" ($lo.StatusCode -eq 200)

# Login again
$li = Post "/api/login" @{email=$stuEmail;password=$pass1} $stuSess
Check "2e Login 200" ($li.StatusCode -eq 200)

# Wrong password
$bad = Post "/api/login" @{email=$stuEmail;password="wrongpassword"}
Check "2f Wrong password 401" ($bad.StatusCode -eq 401)

# ── 3. Student profile ────────────────────────────────────────────────────────
$prof = Get "/api/profile" $stuSess
Check "3a Profile GET 200" ($prof.StatusCode -eq 200)

$upd = Invoke-WebRequest "$base/api/profile" -Method PUT `
  -Body (@{name="Verified Student";department="Computer Science";semester="Sem 3"}|ConvertTo-Json) `
  -ContentType "application/json" -WebSession $stuSess -UseBasicParsing -ErrorAction SilentlyContinue
Check "3b Profile PUT 200" ($upd.StatusCode -eq 200)
$updBody = $upd.Content | ConvertFrom-Json
Check "3c Profile name updated" ($updBody.user.department -eq "Computer Science")

# Invalid avatar
$badAvatar = Invoke-WebRequest "$base/api/profile" -Method PUT `
  -Body (@{avatar="not-a-url"}|ConvertTo-Json) -ContentType "application/json" `
  -WebSession $stuSess -UseBasicParsing -ErrorAction SilentlyContinue
Check "3d Invalid avatar 400" ($badAvatar.StatusCode -eq 400)

# ── 4. Course CRUD ────────────────────────────────────────────────────────────
$crs = Post "/api/courses" @{name="Data Structures";code="DS101";instructor="Dr. Smith";credits=3;semester="Sem 3"} $stuSess
Check "4a Create course 201" ($crs.StatusCode -eq 201)
$crsId = ($crs.Content | ConvertFrom-Json).course._id

$list = Get "/api/courses" $stuSess
Check "4b List courses 200" ($list.StatusCode -eq 200)

$search = Get "/api/courses?search=Data" $stuSess
Check "4c Search courses 200" ($search.StatusCode -eq 200)

$upCrs = Invoke-WebRequest "$base/api/courses/$crsId" -Method PUT `
  -Body (@{name="Data Structures Updated"}|ConvertTo-Json) -ContentType "application/json" `
  -WebSession $stuSess -UseBasicParsing -ErrorAction SilentlyContinue
Check "4d Update course 200" ($upCrs.StatusCode -eq 200)

$dupCrs = Post "/api/courses" @{name="DS Dup";code="DS101";instructor="X";credits=3;semester="Sem 3"} $stuSess
Check "4e Duplicate code 409" ($dupCrs.StatusCode -eq 409)

$delCrs = Delete "/api/courses/$crsId" $stuSess
Check "4f Delete course 200" ($delCrs.StatusCode -eq 200)

# ── 5. Student request workflow ───────────────────────────────────────────────
$req = Post "/api/requests" @{type="general";description="Test verification request for E2E testing";priority="normal";department="Computer Science"} $stuSess
Check "5a Create request 201" ($req.StatusCode -eq 201)
$reqId = ($req.Content | ConvertFrom-Json).request._id
Check "5b Request has slaDeadline" ($null -ne ($req.Content|ConvertFrom-Json).request.slaDeadline)

$myReqs = Get "/api/requests" $stuSess
Check "5c List my requests 200" ($myReqs.StatusCode -eq 200)

$filtReqs = Get "/api/requests?status=pending" $stuSess
Check "5d Filter requests by status" ($filtReqs.StatusCode -eq 200)

$oneReq = Get "/api/requests/$reqId" $stuSess
Check "5e Get single request 200" ($oneReq.StatusCode -eq 200)

# Add comment
$cmt = Post "/api/requests/$reqId/comment" @{comment="Providing additional info for verification"} $stuSess
Check "5f Add comment 201" ($cmt.StatusCode -eq 201)

# Cancel
$can = Delete "/api/requests/$reqId" $stuSess
Check "5g Cancel request 200" ($can.StatusCode -eq 200)

# ── 6. Faculty/HOD setup via admin ───────────────────────────────────────────
# Register admin
$admSess = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$admReg = Post "/api/register" @{name="Verify Admin";email=$admEmail;password=$pass1} $admSess

# Promote to admin via DB (exec into container)
$admId = ($admReg.Content|ConvertFrom-Json).user.id
$promoteCmd = "const mongoose=require('mongoose'),User=require('./models/User');mongoose.connect(process.env.MONGO_URI).then(async()=>{await User.findByIdAndUpdate('$admId',{role:'admin'});process.exit(0);})"
docker exec campusflow_backend node -e $promoteCmd 2>$null
Start-Sleep -Seconds 1

# Re-login admin
$admLi = Post "/api/login" @{email=$admEmail;password=$pass1} $admSess
Check "6a Admin login 200" ($admLi.StatusCode -eq 200)

# Register faculty
$facSess = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$facReg = Post "/api/register" @{name="Verify Faculty";email=$facEmail;password=$pass1} $facSess
$facId  = ($facReg.Content|ConvertFrom-Json).user.id
$promoteCmd2 = "const mongoose=require('mongoose'),User=require('./models/User');mongoose.connect(process.env.MONGO_URI).then(async()=>{await User.findByIdAndUpdate('$facId',{role:'faculty',department:'Computer Science'});process.exit(0);})"
docker exec campusflow_backend node -e $promoteCmd2 2>$null
Start-Sleep -Seconds 1
$facLi = Post "/api/login" @{email=$facEmail;password=$pass1} $facSess
Check "6b Faculty login 200" ($facLi.StatusCode -eq 200)

# Register HOD
$hodSess = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$hodReg = Post "/api/register" @{name="Verify HOD";email=$hodEmail;password=$pass1} $hodSess
$hodId  = ($hodReg.Content|ConvertFrom-Json).user.id
$promoteCmd3 = "const mongoose=require('mongoose'),User=require('./models/User');mongoose.connect(process.env.MONGO_URI).then(async()=>{await User.findByIdAndUpdate('$hodId',{role:'hod',department:'Computer Science'});process.exit(0);})"
docker exec campusflow_backend node -e $promoteCmd3 2>$null
Start-Sleep -Seconds 1
$hodLi = Post "/api/login" @{email=$hodEmail;password=$pass1} $hodSess
Check "6c HOD login 200" ($hodLi.StatusCode -eq 200)

# ── 7. Faculty review queue ───────────────────────────────────────────────────
# Create a new request from student
$req2 = Post "/api/requests" @{type="grade_appeal";description="Request for grade review appeal E2E testing verification";priority="high";department="Computer Science"} $stuSess
$reqId2 = ($req2.Content|ConvertFrom-Json).request._id

$queue = Get "/api/requests/pending" $facSess
Check "7a Faculty sees pending queue 200" ($queue.StatusCode -eq 200)

# Student cannot access reviewer queue
$stuQueue = Get "/api/requests/pending" $stuSess
Check "7b Student blocked from reviewer queue 403" ($stuQueue.StatusCode -eq 403)

# Faculty approves
$approv = Patch "/api/requests/$reqId2/status" @{status="approved";comment="Approved after review"} $facSess
Check "7c Faculty approves request 200" ($approv.StatusCode -eq 200)
Check "7d Status updated to approved" (($approv.Content|ConvertFrom-Json).request.status -eq "approved")

# Create another for reject test
$req3 = Post "/api/requests" @{type="transcript";description="Transcript request for E2E rejection test verification";priority="normal";department="Computer Science"} $stuSess
$reqId3 = ($req3.Content|ConvertFrom-Json).request._id

$rej = Patch "/api/requests/$reqId3/status" @{status="rejected";comment="Insufficient documentation provided"} $facSess
Check "7e Faculty rejects with comment 200" ($rej.StatusCode -eq 200)

# Reject without comment should fail
$req4 = Post "/api/requests" @{type="financial_aid";description="Financial aid request for E2E testing escalation workflow";priority="urgent";department="Computer Science"} $stuSess
$reqId4 = ($req4.Content|ConvertFrom-Json).request._id
$rejNoComment = Patch "/api/requests/$reqId4/status" @{status="rejected"} $facSess
Check "7f Reject without comment 400" ($rejNoComment.StatusCode -eq 400)

# Faculty escalates
$esc = Patch "/api/requests/$reqId4/status" @{status="escalated";comment="Escalating to HOD for final decision"} $facSess
Check "7g Faculty escalates to HOD 200" ($esc.StatusCode -eq 200)

# ── 8. HOD review ─────────────────────────────────────────────────────────────
$hodQueue = Get "/api/requests/pending" $hodSess
Check "8a HOD sees pending queue 200" ($hodQueue.StatusCode -eq 200)

$hodClose = Patch "/api/requests/$reqId4/status" @{status="closed";comment="Administratively closed after HOD review"} $hodSess
Check "8b HOD closes request 200" ($hodClose.StatusCode -eq 200)

# ── 9. Leave types ────────────────────────────────────────────────────────────
$ltCreate = Invoke-WebRequest "$base/api/leave-types" -Method POST `
  -Body (@{name="Verify Medical $ts";maxDaysPerYear=10;requiresDocument=$false}|ConvertTo-Json) `
  -ContentType "application/json" -WebSession $admSess -UseBasicParsing -ErrorAction SilentlyContinue
Check "9a Admin creates leave type 201" ($ltCreate.StatusCode -eq 201)
$ltId = ($ltCreate.Content|ConvertFrom-Json).leaveType._id

$ltList = Get "/api/leave-types" $stuSess
Check "9b Student sees leave types 200" ($ltList.StatusCode -eq 200)

# Student cannot create leave type
$ltUnauth = Invoke-WebRequest "$base/api/leave-types" -Method POST `
  -Body (@{name="Hack"}|ConvertTo-Json) -ContentType "application/json" `
  -WebSession $stuSess -UseBasicParsing -ErrorAction SilentlyContinue
Check "9c Student blocked from creating leave type 403" ($ltUnauth.StatusCode -eq 403)

# ── 10. Leave application ─────────────────────────────────────────────────────
$startD = (Get-Date).AddDays(3).ToString("yyyy-MM-dd")
$endD   = (Get-Date).AddDays(5).ToString("yyyy-MM-dd")

$leave = Post "/api/leave" @{leaveTypeId=$ltId;startDate=$startD;endDate=$endD;reason="Medical appointment E2E verification test"} $stuSess
Check "10a Student applies for leave 201" ($leave.StatusCode -eq 201)
$leaveBody = $leave.Content|ConvertFrom-Json
$leaveId = $leaveBody.leave._id
Check "10b Leave has totalDays > 0" ($leaveBody.leave.totalDays -gt 0)
Check "10c Leave status is pending" ($leaveBody.leave.status -eq "pending")

# End before start should fail
$badLeave = Post "/api/leave" @{leaveTypeId=$ltId;startDate=$endD;endDate=$startD;reason="Invalid date E2E test"} $stuSess
Check "10d End before start 400" ($badLeave.StatusCode -eq 400)

# Short reason fails
$shortReason = Post "/api/leave" @{leaveTypeId=$ltId;startDate=((Get-Date).AddDays(10).ToString("yyyy-MM-dd"));endDate=((Get-Date).AddDays(11).ToString("yyyy-MM-dd"));reason="short"} $stuSess
Check "10e Short reason 400" ($shortReason.StatusCode -eq 400)

# Overlap detection
$overlap = Post "/api/leave" @{leaveTypeId=$ltId;startDate=$startD;endDate=$endD;reason="Overlapping dates E2E test detection"} $stuSess
Check "10f Overlap detection 409" ($overlap.StatusCode -eq 409)

# View my leaves
$myLeaves = Get "/api/leave" $stuSess
Check "10g List my leaves 200" ($myLeaves.StatusCode -eq 200)

# View single leave
$oneLeave = Get "/api/leave/$leaveId" $stuSess
Check "10h Get single leave 200" ($oneLeave.StatusCode -eq 200)

# ── 11. Faculty leave review ──────────────────────────────────────────────────
$leaveQueue = Get "/api/leave/staff/queue" $facSess
Check "11a Faculty sees leave queue 200" ($leaveQueue.StatusCode -eq 200)

# Student blocked from staff queue
$stuLeaveQueue = Get "/api/leave/staff/queue" $stuSess
Check "11b Student blocked from leave queue 403" ($stuLeaveQueue.StatusCode -eq 403)

# Faculty approves leave
$leaveApprove = Invoke-WebRequest "$base/api/leave/$leaveId/review" -Method PATCH `
  -Body (@{decision="approved";comment="Approved for medical reasons"}|ConvertTo-Json) `
  -ContentType "application/json" -WebSession $facSess -UseBasicParsing -ErrorAction SilentlyContinue
Check "11c Faculty approves leave 200" ($leaveApprove.StatusCode -eq 200)
Check "11d Leave status is approved" (($leaveApprove.Content|ConvertFrom-Json).leave.status -eq "approved")

# Apply another for cancel test
$startD2 = (Get-Date).AddDays(15).ToString("yyyy-MM-dd")
$endD2   = (Get-Date).AddDays(16).ToString("yyyy-MM-dd")
$leave2 = Post "/api/leave" @{leaveTypeId=$ltId;startDate=$startD2;endDate=$endD2;reason="Second leave application E2E test cancel"} $stuSess
$leaveId2 = ($leave2.Content|ConvertFrom-Json).leave._id

# Reject without reason must fail
$rejectNoReason = Invoke-WebRequest "$base/api/leave/$leaveId2/review" -Method PATCH `
  -Body (@{decision="rejected"}|ConvertTo-Json) -ContentType "application/json" `
  -WebSession $facSess -UseBasicParsing -ErrorAction SilentlyContinue
Check "11e Reject leave without reason 400" ($rejectNoReason.StatusCode -eq 400)

# ── 12. Student leave cancellation ───────────────────────────────────────────
$cancelLeave = Invoke-WebRequest "$base/api/leave/$leaveId2/cancel" -Method PATCH `
  -WebSession $stuSess -UseBasicParsing -ErrorAction SilentlyContinue
Check "12a Student cancels pending leave 200" ($cancelLeave.StatusCode -eq 200)
Check "12b Leave status is cancelled" (($cancelLeave.Content|ConvertFrom-Json).leave.status -eq "cancelled")

# Already-approved leave cannot be cancelled
$cancelApproved = Invoke-WebRequest "$base/api/leave/$leaveId/cancel" -Method PATCH `
  -WebSession $stuSess -UseBasicParsing -ErrorAction SilentlyContinue
Check "12c Cannot cancel approved leave 409" ($cancelApproved.StatusCode -eq 409)

# ── 13. Admin analytics ───────────────────────────────────────────────────────
$metrics = Get "/api/admin/metrics" $admSess
Check "13a Admin metrics 200" ($metrics.StatusCode -eq 200)

$analytics = Get "/api/admin/analytics" $admSess
Check "13b Admin analytics 200" ($analytics.StatusCode -eq 200)
$an = ($analytics.Content|ConvertFrom-Json).analytics
Check "13c Analytics has totalRequests" ($null -ne $an.totalRequests)
Check "13d Analytics has byStatus" ($null -ne $an.byStatus)
Check "13e Analytics has monthlyTrend" ($null -ne $an.monthlyTrend)
Check "13f Analytics has SLA metrics" ($null -ne $an.sla)

$leaveStats = Get "/api/leave/admin/stats" $admSess
Check "13g Leave stats 200" ($leaveStats.StatusCode -eq 200)

# Student blocked from analytics
$stuAnalytics = Get "/api/admin/analytics" $stuSess
Check "13h Student blocked from analytics 403" ($stuAnalytics.StatusCode -eq 403)

# ── 14. Admin user management ────────────────────────────────────────────────
$users = Get "/api/admin/users" $admSess
Check "14a Admin user list 200" ($users.StatusCode -eq 200)
Check "14b Users list has pagination" ($null -ne ($users.Content|ConvertFrom-Json).pagination)

$searchUsers = Get "/api/admin/users?search=Verify" $admSess
Check "14c User search 200" ($searchUsers.StatusCode -eq 200)

# Admin creates user
$newUserTs = [int][double]::Parse((Get-Date -UFormat %s))
$newUser = Invoke-WebRequest "$base/api/admin/users" -Method POST `
  -Body (@{name="Created User";email="created_$newUserTs@test.com";password="Pass1234!";role="student"}|ConvertTo-Json) `
  -ContentType "application/json" -WebSession $admSess -UseBasicParsing -ErrorAction SilentlyContinue
Check "14d Admin creates user 201" ($newUser.StatusCode -eq 201)
$newUserId = ($newUser.Content|ConvertFrom-Json).user.id

# Change role
$roleChange = Invoke-WebRequest "$base/api/admin/users/$newUserId/role" -Method PATCH `
  -Body (@{role="faculty"}|ConvertTo-Json) -ContentType "application/json" `
  -WebSession $admSess -UseBasicParsing -ErrorAction SilentlyContinue
Check "14e Admin changes role 200" ($roleChange.StatusCode -eq 200)
Check "14f Role updated to faculty" (($roleChange.Content|ConvertFrom-Json).user.role -eq "faculty")

# Invalid role
$badRole = Invoke-WebRequest "$base/api/admin/users/$newUserId/role" -Method PATCH `
  -Body (@{role="superuser"}|ConvertTo-Json) -ContentType "application/json" `
  -WebSession $admSess -UseBasicParsing -ErrorAction SilentlyContinue
Check "14g Invalid role 400" ($badRole.StatusCode -eq 400)

# Delete user
$delUser = Invoke-WebRequest "$base/api/admin/users/$newUserId" -Method DELETE `
  -WebSession $admSess -UseBasicParsing -ErrorAction SilentlyContinue
Check "14h Delete user 200" ($delUser.StatusCode -eq 200)

# ── 15. Admin audit logs ──────────────────────────────────────────────────────
$audit = Get "/api/admin/audit-logs" $admSess
Check "15a Admin audit logs 200" ($audit.StatusCode -eq 200)
Check "15b Audit log has entries" (($audit.Content|ConvertFrom-Json).pagination.total -gt 0)

# ── 16. Admin all requests ────────────────────────────────────────────────────
$allReqs = Get "/api/admin/requests" $admSess
Check "16a Admin all requests 200" ($allReqs.StatusCode -eq 200)

$allLeaves = Get "/api/leave/admin/all" $admSess
Check "16b Admin all leaves 200" ($allLeaves.StatusCode -eq 200)

# ── 17. RBAC boundary tests ───────────────────────────────────────────────────
$stuAdmin = Get "/api/admin/users" $stuSess
Check "17a Student blocked from admin endpoints 403" ($stuAdmin.StatusCode -eq 403)

$facAdmin = Get "/api/admin/users" $facSess
Check "17b Faculty blocked from admin endpoints 403" ($facAdmin.StatusCode -eq 403)

$noAuth = Get "/api/requests"
Check "17c Unauthenticated request 401" ($noAuth.StatusCode -eq 401)

$noAuthLeave = Get "/api/leave"
Check "17d Unauthenticated leave 401" ($noAuthLeave.StatusCode -eq 401)

# ── 18. Correlation ID ────────────────────────────────────────────────────────
$hthRaw = Invoke-WebRequest "$base/health" -UseBasicParsing
Check "18a X-Request-ID header present" ($hthRaw.Headers["X-Request-ID"] -ne $null)
$id1 = $hthRaw.Headers["X-Request-ID"]
$hthRaw2 = Invoke-WebRequest "$base/health" -UseBasicParsing
Check "18b Unique correlation IDs" ($id1 -ne $hthRaw2.Headers["X-Request-ID"])

# ── 19. Refresh token ─────────────────────────────────────────────────────────
$stu2Sess = New-Object Microsoft.PowerShell.Commands.WebRequestSession
Post "/api/login" @{email=$stuEmail;password=$pass1} $stu2Sess | Out-Null
$refresh = Invoke-WebRequest "$base/api/refresh" -Method POST `
  -WebSession $stu2Sess -UseBasicParsing -ErrorAction SilentlyContinue
Check "19a Refresh token 200" ($refresh.StatusCode -eq 200)
Check "19b Refresh returns user" ($null -ne ($refresh.Content|ConvertFrom-Json).user)

# ── 20. Logout-all sessions ───────────────────────────────────────────────────
$logoutAll = Invoke-WebRequest "$base/api/logout-all" -Method POST `
  -WebSession $stuSess -UseBasicParsing -ErrorAction SilentlyContinue
Check "20a Logout-all 200" ($logoutAll.StatusCode -eq 200)
$afterLogout = Get "/api/me" $stuSess
Check "20b /me returns 401 after logout-all" ($afterLogout.StatusCode -eq 401)

# ── Results ───────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "═══════════════════════════════════════════════════"
Write-Host " CampusFlow E2E Verification Results"
Write-Host "═══════════════════════════════════════════════════"
$results | ForEach-Object { Write-Host $_ }
Write-Host "═══════════════════════════════════════════════════"
Write-Host " PASSED: $pass   FAILED: $fail   TOTAL: $($pass+$fail)"
Write-Host "═══════════════════════════════════════════════════"
