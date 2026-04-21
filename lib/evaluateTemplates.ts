export const DEFAULT_EVALUATE_TEMPLATE = `def evaluate(submission_path, answer_path):
    """Custom evaluation function.

    Args:
        submission_path: Path to user's .pkl submission file
        answer_path: Path to ground truth .pkl file

    Returns:
        float score (0-100, higher is better)

    Example:
        import pickle
        with open(submission_path, "rb") as f:
            submission = pickle.load(f)
        with open(answer_path, "rb") as f:
            answer = pickle.load(f)
        # ... compute score ...
        return 0.0
    """
    import pickle

    with open(submission_path, "rb") as f:
        submission = pickle.load(f)
    with open(answer_path, "rb") as f:
        answer = pickle.load(f)

    # TODO: implement your evaluation logic here
    # Return a float score (0-100, higher is better)
    return 0.0
`;
