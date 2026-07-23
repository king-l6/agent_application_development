import unittest

from python_practice.task_validation import InvalidTaskError, validate_goal


class ValidateGoalTests(unittest.TestCase):
    def test_valid_goal_is_returned(self):
        result = validate_goal("fix login bug")

        self.assertEqual("fix login bug", result)

    def test_blank_goal_raises_error(self):
        with self.assertRaises(InvalidTaskError):
            validate_goal("   ")


if __name__ == "__main__":
    unittest.main()
