package org.example.citoscan.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "users")
@Getter
@Setter
public class User {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long userId;

    @Column(unique = true, nullable = false)
    private String email;

    @Column(nullable = false)
    private String password;

    @Column(nullable = false)
    private String firstName;

    @Column(nullable = false)
    private String lastName;

    @Column(nullable = false)
    private String institution;

    @Column(nullable = false)
    private Boolean emailVerified = false;

    @Column
    private String verificationToken;

    @Column
    private java.time.LocalDateTime tokenExpiry;

    @Column
    private String passwordResetToken;

    @Column
    private java.time.LocalDateTime passwordResetExpiry;

    public User() {}

    public User(String email, String password, String firstName, String lastName, String institution) {
        this.email = email;
        this.password = password;
        this.firstName = firstName;
        this.lastName = lastName;
        this.institution = institution;
    }
}
