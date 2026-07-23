class InvalidTaskError(Exception):
    pass


def validate_goal(goal):
    if not goal.strip():
        raise InvalidTaskError("goal must not be blank")
    return goal
 