package org.example.citoscan.repository;

import org.example.citoscan.model.User;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserRepository extends JpaRepository<User, Long> {
    User findUserByEmail(String email);
    User findByUserId(Long userId);
}