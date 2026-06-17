var p = new URLSearchParams(location.search);
if (p.get("step") === "2fa") {
  document.getElementById("formPw").style.display = "none";
  document.getElementById("form2fa").style.display = "flex";
  document.querySelector("#form2fa input[name=code]").focus();
  if (p.get("error")) document.getElementById("tfaError").style.display = "block";
} else if (p.get("error")) {
  document.getElementById("loginError").style.display = "block";
}
