#!/bin/bash

# Test Promotions System Enhancement
# This script tests all the new and modified API endpoints

API_BASE="http://localhost:3000/api"
SCHOOL_ID=1

echo "========================================="
echo "Promotions System Enhancement - API Tests"
echo "========================================="
echo ""

# Test 1: GET all promotions (no academic year required)
echo "TEST 1: GET /promotions (All learners - no academic year required)"
echo "---"
curl -s -X GET "$API_BASE/promotions?school_id=$SCHOOL_ID" | jq '.success, .data | length, .stats' 
echo ""
echo ""

# Test 2: GET with status filter
echo "TEST 2: GET /promotions with status filter (promoted)"
echo "---"
curl -s -X GET "$API_BASE/promotions?school_id=$SCHOOL_ID&status=promoted" | jq '.stats.promoted'
echo ""
echo ""

# Test 3: GET with search
echo "TEST 3: GET /promotions with search (e.g., 'Ahmed')"
echo "---"
curl -s -X GET "$API_BASE/promotions?school_id=$SCHOOL_ID&search=Ahmed" | jq '.data | length'
echo ""
echo ""

# Test 4: POST single promotion
echo "TEST 4: POST /promotions (Promote single student)"
echo "---"
curl -s -X POST "$API_BASE/promotions" \
  -H "Content-Type: application/json" \
  -d '{
    "school_id": 1,
    "student_id": 1,
    "from_class_id": 1,
    "to_class_id": 2,
    "from_academic_year_id": 1,
    "to_academic_year_id": 1,
    "promotion_status": "promoted",
    "promotion_reason": "manual",
    "term_used": "Term 3",
    "promoted_by": 1,
    "user_ip": "127.0.0.1"
  }' | jq '.success, .message'
echo ""
echo ""

# Test 5: POST preview for condition-based
echo "TEST 5: POST /promotions/preview (Generate preview)"
echo "---"
curl -s -X POST "$API_BASE/promotions/preview" \
  -H "Content-Type: application/json" \
  -d '{
    "school_id": 1,
    "academic_year_id": 1,
    "from_class_id": 1,
    "to_class_id": 2,
    "minimum_total_marks": 250,
    "minimum_average_marks": 50,
    "minimum_subjects_passed": 0,
    "attendance_percentage": 75
  }' | jq '.preview.summary'
echo ""
echo ""

# Test 6: POST bulk promotion (manual)
echo "TEST 6: POST /promotions/bulk (Manual bulk promotion)"
echo "---"
curl -s -X POST "$API_BASE/promotions/bulk" \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "manual",
    "school_id": 1,
    "academic_year_id": 1,
    "from_class_id": 1,
    "to_class_id": 2,
    "to_academic_year_id": 1,
    "student_ids": [1, 2, 3],
    "promotion_reason": "manual",
    "promoted_by": 1
  }' | jq '.success, .promoted_count, .failed_count'
echo ""
echo ""

# Test 7: POST bulk promotion (condition-based)
echo "TEST 7: POST /promotions/bulk (Condition-based bulk promotion)"
echo "---"
curl -s -X POST "$API_BASE/promotions/bulk" \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "condition_based",
    "school_id": 1,
    "academic_year_id": 1,
    "from_class_id": 1,
    "to_class_id": 2,
    "to_academic_year_id": 1,
    "criteria": {
      "minimum_total_marks": 250,
      "minimum_average_marks": 50,
      "minimum_subjects_passed": 0,
      "attendance_percentage": 75
    },
    "promotion_reason": "criteria_based",
    "promoted_by": 1
  }' | jq '.success, .promoted_count, .failed_count'
echo ""
echo ""

echo "========================================="
echo "✓ All tests completed"
echo "========================================="
