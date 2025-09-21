package org.example.citoscan.dto.request;

import jakarta.validation.constraints.NotBlank;

public class CreateUserRequest {

    @NotBlank(message = "El campo del mail no puede estar vacío")
    private String email;

    @NotBlank(message = "El campo de la contraseña no puede estar vacío")
    private String password;

    @NotBlank(message = "El campo del nombre no puede estar vacío")
    private String firstName;

    @NotBlank(message = "El campo del apellido no puede estar vacío")
    private String lastName;

    @NotBlank(message = "El campo de la institución no puede estar vacío")
    private String institution;

    public CreateUserRequest() {
    }

    public CreateUserRequest(String email, String password, String firstName, String lastName, String institution) {
        this.email = email;
        this.password = password;
        this.firstName = firstName;
        this.lastName = lastName;
        this.institution = institution;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getPassword() {
        return password;
    }

    public void setPassword(String password) {
        this.password = password;
    }

    public String getFirstName() {
        return firstName;
    }

    public void setFirstName(String firstName) {
        this.firstName = firstName;
    }

    public String getLastName() {
        return lastName;
    }

    public void setLastName(String lastName) {
        this.lastName = lastName;
    }

    public String getInstitution() {
        return institution;
    }

    public void setInstitution(String institution) {
        this.institution = institution;
    }
}