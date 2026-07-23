class InvalidTaskError(Exception):
    pass


def validate_goal(goal):
    if not goal.strip():
        raise InvalidTaskError("goal must not be blank")
    return goal


try:
    validated_goal = validate_goal("   ")
    print(validated_goal)
except InvalidTaskError as error:
    print(f"validation failed: {error}")
