for file in $(find $(pwd) -type f); do mv "$file" `echo "$file"|sed s#[.]#.$(md5sum $file|awk '{print $1}').#`; done
