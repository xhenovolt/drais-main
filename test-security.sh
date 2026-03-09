#!/bin/bash

# DRAIS Security Test Script
# Tests the complete authentication flow and route protection

set -e

BASE_URL="http://localhost:3003"
COOKIE_FILE="/tmp/drais_security_test_cookies.txt"
TEST_EMAIL="sectest$(date +%s)@test.com"
TEST_PASSWORD="Test1234!@#"
TEST_SCHOOL="Security Test School"

echo "========================================="
echo "DRAIS V1 SECURITY VERIFICATION TEST"
echo "========================================="
echo ""

# Clean up previous test
rm -f "$COOKIE_FILE"

echo "TEST 1: Unauthenticated API Access"
echo "-----------------------------------"
echo -n "GET /api/auth/me (no auth): "
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$BASE_URL/api/auth/me")
if [ "$RESPONSE" = "401" ]; then
    echo "✅ PASS (401 Unauthorized)"
else
    echo "❌ FAIL (Expected 401, got $RESPONSE)"
    exit 1
fi
echo ""

echo "TEST 2: User Signup"
echo "-----------------------------------"
echo "Creating test user: $TEST_EMAIL"
SIGNUP_RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth/signup" \
    -H "Content-Type: application/json" \
    -d "{
        \"firstName\": \"Security\",
        \"lastName\": \"Test\",
        \"email\": \"$TEST_EMAIL\",
        \"password\": \"$TEST_PASSWORD\",
        \"confirmPassword\": \"$TEST_PASSWORD\",
        \"schoolName\": \"$TEST_SCHOOL\"
    }" \
    -c "$COOKIE_FILE" \
    --max-time 10)

SUCCESS=$(echo "$SIGNUP_RESPONSE" | grep -o '"success":true' || echo "")
if [ -n "$SUCCESS" ]; then
    echo "✅ PASS - User created successfully"
    
    # Check if session cookie is set
    if grep -q "drais_session" "$COOKIE_FILE"; then
        echo "✅ PASS - Session cookie set"
    else
        echo "❌ FAIL - Session cookie not set"
        exit 1
    fi
else
    echo "❌ FAIL - Signup failed"
    echo "Response: $SIGNUP_RESPONSE"
    exit 1
fi
echo ""

echo "TEST 3: Session Validation"
echo "-----------------------------------"
echo -n "GET /api/auth/me (with session): "
ME_RESPONSE=$(curl -s -b "$COOKIE_FILE" --max-time 10 "$BASE_URL/api/auth/me")
SUCCESS=$(echo "$ME_RESPONSE" | grep -o '"success":true' || echo "")
if [ -n "$SUCCESS" ]; then
    echo "✅ PASS"
    USER_EMAIL=$(echo "$ME_RESPONSE" | grep -o "\"email\":\"[^\"]*\"" | cut -d'"' -f4)
    SCHOOL_NAME=$(echo "$ME_RESPONSE" | grep -o "\"schoolName\":\"[^\"]*\"" | cut -d'"' -f4)
    echo "   User: $USER_EMAIL"
    echo "   School: $SCHOOL_NAME"
else
    echo "❌ FAIL"
    echo "Response: $ME_RESPONSE"
    exit 1
fi
echo ""

echo "TEST 4: Logout"
echo "-----------------------------------"
echo -n "POST /api/auth/logout: "
LOGOUT_RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth/logout" \
    -b "$COOKIE_FILE" \
    -c "$COOKIE_FILE" \
    --max-time 10)

SUCCESS=$(echo "$LOGOUT_RESPONSE" | grep -o '"success":true' || echo "")
if [ -n "$SUCCESS" ]; then
    echo "✅ PASS - Logout successful"
else
    echo "❌ FAIL - Logout failed"
    echo "Response: $LOGOUT_RESPONSE"
    exit 1
fi
echo ""

echo "TEST 5: Post-Logout Security"
echo "-----------------------------------"
echo -n "GET /api/auth/me (after logout): "
POST_LOGOUT_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_FILE" --max-time 10 "$BASE_URL/api/auth/me")
if [ "$POST_LOGOUT_RESPONSE" = "401" ]; then
    echo "✅ PASS (401 Unauthorized)"
    echo "   Session properly invalidated"
else
    echo "❌ FAIL (Expected 401, got $POST_LOGOUT_RESPONSE)"
    echo "   ⚠️  SECURITY VULNERABILITY: Protected route accessible after logout"
    exit 1
fi
echo ""

echo "TEST 6: Re-login with Same Credentials"
echo "-----------------------------------"
echo -n "POST /api/auth/login: "
LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "{
        \"email\": \"$TEST_EMAIL\",
        \"password\": \"$TEST_PASSWORD\"
    }" \
    -c "$COOKIE_FILE" \
    --max-time 10)

SUCCESS=$(echo "$LOGIN_RESPONSE" | grep -o '"success":true' || echo "")
if [ -n "$SUCCESS" ]; then
    echo "✅ PASS - Login successful"
    
    # Verify new session works
    ME_RESPONSE=$(curl -s -b "$COOKIE_FILE" --max-time 10 "$BASE_URL/api/auth/me")
    SUCCESS=$(echo "$ME_RESPONSE" | grep -o '"success":true' || echo "")
    if [ -n "$SUCCESS" ]; then
        echo "✅ PASS - New session validated"
    else
        echo "❌ FAIL - New session validation failed"
        exit 1
    fi
else
    echo "❌ FAIL - Login failed"
    echo "Response: $LOGIN_RESPONSE"
    exit 1
fi
echo ""

echo "========================================="
echo "✅ ALL SECURITY TESTS PASSED"
echo "========================================="
echo ""
echo "Summary:"
echo "  • Unauthenticated access properly blocked"
echo "  • Signup creates valid session"
echo "  • Session validation works"
echo "  • Logout invalidates session"
echo "  • Post-logout access properly blocked"
echo "  • Re-login creates new valid session"
echo ""
echo "✅ Route protection is SECURE"
echo ""

# Clean up
rm -f "$COOKIE_FILE"
