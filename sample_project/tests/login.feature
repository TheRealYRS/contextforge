Feature: Login
  Scenario: Valid credentials
    Given the user is on the login page
    When they submit valid credentials
    Then they see the dashboard
