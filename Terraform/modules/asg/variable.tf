variable "project_name" {}
variable "ami" {
  default = ""
}
variable "cpu" {
  default = "t3.micro"
}
variable "max_size" {
  default = 4
}
variable "min_size" {
  default = 2
}
variable "desired_capacity" {
  default = 2
}
variable "private_sub_1a_id" {}
variable "private_sub_2a_id" {}
variable "private_servers_sg" {}
variable "app_tg_arn" {}
