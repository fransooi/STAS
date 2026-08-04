10 ' Une sinusoïde dessinée en ASCII, comme au bon vieux temps
20 cls
30 deg
40 for x=0 to 78
50 y=int(12+10*sin(x*360/78))
60 locate x,y
70 print "*"
80 next x
90 locate 0,24
100 print "STAS — un sinus en ASCII, tapez RUN pour le revoir."
