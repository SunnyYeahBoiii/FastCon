import pickle

# Data to be saved
data = {
    'name': 'Alice',
    'age': 30,
    'skills': ['Python', 'Data Science', 'Machine Learning']
}

# Step 1: Save (Pickle) the data to a file
with open('data.pkl', 'wb') as file:
    pickle.dump(data, file)

# Step 2: Load (Unpickle) the data back
with open('data.pkl', 'rb') as file:
    loaded_data = pickle.load(file)

print(loaded_data)
# Output: {'name': 'Alice', 'age': 30, 'skills': ['Python', 'Data Science', 'Machine Learning']}
