package com.example.users;

import java.util.List;
import java.util.ArrayList;

public class UserService {
    private final List<String> users = new ArrayList<>();

    public void addUser(String name) { users.add(name); }

    public int count() { return users.size(); }
}
